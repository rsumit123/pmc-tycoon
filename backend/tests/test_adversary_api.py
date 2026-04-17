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
        "name": "T", "difficulty": "realistic", "objectives": [], "seed": 3,
    }).json()


def test_get_adversary_returns_three_factions(client):
    c = _create_campaign(client)
    r = client.get(f"/api/campaigns/{c['id']}/adversary")
    assert r.status_code == 200
    body = r.json()
    factions = {f["faction"] for f in body["factions"]}
    assert factions == {"PLAAF", "PAF", "PLAN"}


def test_adversary_plaaf_starts_with_j20a_500(client):
    c = _create_campaign(client)
    body = client.get(f"/api/campaigns/{c['id']}/adversary").json()
    plaaf = next(f for f in body["factions"] if f["faction"] == "PLAAF")
    assert plaaf["state"]["inventory"]["j20a"] == 500


def test_adversary_updates_after_advance(client):
    c = _create_campaign(client)
    # Campaign starts at 2026-Q2. The PAF J-35E inventory_delta lands at
    # 2026-Q3 — the engine ticks the FROM clock, so we need to advance once
    # to roll into Q3 and again to actually tick it.
    client.post(f"/api/campaigns/{c['id']}/advance")
    client.post(f"/api/campaigns/{c['id']}/advance")
    body = client.get(f"/api/campaigns/{c['id']}/adversary").json()
    paf = next(f for f in body["factions"] if f["faction"] == "PAF")
    assert paf["state"]["inventory"]["j35e"] >= 4


def test_get_adversary_404_for_unknown_campaign(client):
    r = client.get("/api/campaigns/99999/adversary")
    assert r.status_code == 404
