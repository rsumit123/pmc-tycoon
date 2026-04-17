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


def _create_campaign(client, seed=42):
    return client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [], "seed": seed,
    }).json()


def _advance_until_vignette(client, campaign_id, max_turns=40):
    """Advance turns until at least one pending vignette appears."""
    for _ in range(max_turns):
        client.post(f"/api/campaigns/{campaign_id}/advance")
        pending = client.get(f"/api/campaigns/{campaign_id}/vignettes/pending").json()
        if pending["vignettes"]:
            return pending["vignettes"][0]
    return None


def test_pending_returns_empty_on_new_campaign(client):
    c = _create_campaign(client)
    r = client.get(f"/api/campaigns/{c['id']}/vignettes/pending")
    assert r.status_code == 200
    body = r.json()
    assert body["vignettes"] == []


def test_pending_returns_fired_vignette(client):
    c = _create_campaign(client, seed=7)
    v = _advance_until_vignette(client, c["id"])
    assert v is not None, "no vignette fired across 40 turns (seed unlucky?)"
    assert v["status"] == "pending"
    assert "ao" in v["planning_state"]


def test_get_single_vignette_returns_detail(client):
    c = _create_campaign(client, seed=7)
    v = _advance_until_vignette(client, c["id"])
    assert v is not None
    r = client.get(f"/api/campaigns/{c['id']}/vignettes/{v['id']}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == v["id"]
    assert body["scenario_id"] == v["scenario_id"]


def test_get_single_vignette_404(client):
    c = _create_campaign(client)
    r = client.get(f"/api/campaigns/{c['id']}/vignettes/99999")
    assert r.status_code == 404


def test_pending_404_for_unknown_campaign(client):
    r = client.get("/api/campaigns/99999/vignettes/pending")
    assert r.status_code == 404
