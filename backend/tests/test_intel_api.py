import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _create_campaign(client):
    return client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [], "seed": 5,
    }).json()


def test_get_intel_returns_turn_zero_seed_card(client):
    c = _create_campaign(client)
    r = client.get(f"/api/campaigns/{c['id']}/intel")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] >= 1
    assert any("J-35E" in card["payload"]["headline"] for card in body["cards"])


def test_get_intel_after_advance_includes_generated_cards(client):
    c = _create_campaign(client)
    client.post(f"/api/campaigns/{c['id']}/advance")
    body = client.get(f"/api/campaigns/{c['id']}/intel").json()
    # Initial seed + roadmap 2026-Q3 events + 4-7 random -> at least 5
    assert body["total"] >= 5


def test_get_intel_filters_by_year_quarter(client):
    c = _create_campaign(client)
    client.post(f"/api/campaigns/{c['id']}/advance")
    body = client.get(f"/api/campaigns/{c['id']}/intel?year=2026&quarter=2").json()
    for card in body["cards"]:
        assert card["appeared_year"] == 2026
        assert card["appeared_quarter"] == 2


def test_get_intel_filters_by_source_type(client):
    c = _create_campaign(client)
    client.post(f"/api/campaigns/{c['id']}/advance")
    body = client.get(f"/api/campaigns/{c['id']}/intel?source_type=IMINT").json()
    for card in body["cards"]:
        assert card["source_type"] == "IMINT"


def test_get_intel_404_for_unknown_campaign(client):
    r = client.get("/api/campaigns/99999/intel")
    assert r.status_code == 404


def test_get_intel_pagination_limit(client):
    c = _create_campaign(client)
    for _ in range(4):
        client.post(f"/api/campaigns/{c['id']}/advance")
    body = client.get(f"/api/campaigns/{c['id']}/intel?limit=3").json()
    assert len(body["cards"]) == 3
    assert body["total"] >= 10
