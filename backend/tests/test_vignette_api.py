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


def _valid_commit(eligible_squadrons):
    sq = eligible_squadrons[0]
    return {
        "squadrons": [{"squadron_id": sq["squadron_id"], "airframes": min(4, sq["airframes_available"])}],
        "support": {"awacs": True, "tanker": False, "sead_package": False},
        "roe": "weapons_free",
    }


def test_commit_resolves_vignette(client):
    c = _create_campaign(client, seed=7)
    v = _advance_until_vignette(client, c["id"])
    assert v is not None
    eligible = v["planning_state"]["eligible_squadrons"]
    if not eligible:
        pytest.skip("no eligible squadron for this seed")
    body = _valid_commit(eligible)
    r = client.post(f"/api/campaigns/{c['id']}/vignettes/{v['id']}/commit", json=body)
    assert r.status_code == 200
    resolved = r.json()
    assert resolved["status"] == "resolved"
    assert resolved["outcome"]
    assert resolved["event_trace"]
    assert resolved["resolved_at"] is not None


def test_commit_rejects_unknown_squadron(client):
    c = _create_campaign(client, seed=7)
    v = _advance_until_vignette(client, c["id"])
    if v is None:
        pytest.skip("no vignette fired")
    body = {
        "squadrons": [{"squadron_id": 999999, "airframes": 1}],
        "support": {"awacs": False, "tanker": False, "sead_package": False},
        "roe": "weapons_free",
    }
    r = client.post(f"/api/campaigns/{c['id']}/vignettes/{v['id']}/commit", json=body)
    assert r.status_code == 400


def test_commit_rejects_too_many_airframes(client):
    c = _create_campaign(client, seed=7)
    v = _advance_until_vignette(client, c["id"])
    if v is None:
        pytest.skip("no vignette fired")
    eligible = v["planning_state"]["eligible_squadrons"]
    if not eligible:
        pytest.skip("no eligible squadron")
    sq = eligible[0]
    body = {
        "squadrons": [{"squadron_id": sq["squadron_id"],
                        "airframes": sq["airframes_available"] + 100}],
        "support": {"awacs": False, "tanker": False, "sead_package": False},
        "roe": "weapons_free",
    }
    r = client.post(f"/api/campaigns/{c['id']}/vignettes/{v['id']}/commit", json=body)
    assert r.status_code == 400


def test_commit_rejects_invalid_roe(client):
    c = _create_campaign(client, seed=7)
    v = _advance_until_vignette(client, c["id"])
    if v is None:
        pytest.skip("no vignette fired")
    eligible = v["planning_state"]["eligible_squadrons"]
    if not eligible:
        pytest.skip("no eligible squadron")
    sq = eligible[0]
    body = {
        "squadrons": [{"squadron_id": sq["squadron_id"], "airframes": 1}],
        "support": {"awacs": False, "tanker": False, "sead_package": False},
        "roe": "nukes_from_orbit",
    }
    r = client.post(f"/api/campaigns/{c['id']}/vignettes/{v['id']}/commit", json=body)
    assert r.status_code == 400


def test_commit_already_resolved_409(client):
    c = _create_campaign(client, seed=7)
    v = _advance_until_vignette(client, c["id"])
    if v is None:
        pytest.skip("no vignette fired")
    eligible = v["planning_state"]["eligible_squadrons"]
    if not eligible:
        pytest.skip("no eligible squadron")
    body = _valid_commit(eligible)
    client.post(f"/api/campaigns/{c['id']}/vignettes/{v['id']}/commit", json=body)
    r2 = client.post(f"/api/campaigns/{c['id']}/vignettes/{v['id']}/commit", json=body)
    assert r2.status_code == 409


def test_commit_deterministic_with_same_seed(client):
    c1 = _create_campaign(client, seed=7)
    v1 = _advance_until_vignette(client, c1["id"])
    if v1 is None:
        pytest.skip("no vignette fired")
    eligible1 = v1["planning_state"]["eligible_squadrons"]
    if not eligible1:
        pytest.skip("no eligible squadron")
    body1 = _valid_commit(eligible1)
    r1 = client.post(f"/api/campaigns/{c1['id']}/vignettes/{v1['id']}/commit", json=body1)
    outcome1 = r1.json()["outcome"]

    c2 = _create_campaign(client, seed=7)
    v2 = _advance_until_vignette(client, c2["id"])
    assert v2 is not None
    eligible2 = v2["planning_state"]["eligible_squadrons"]
    body2 = _valid_commit(eligible2)
    r2 = client.post(f"/api/campaigns/{c2['id']}/vignettes/{v2['id']}/commit", json=body2)
    outcome2 = r2.json()["outcome"]

    assert outcome1 == outcome2
