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
    for _ in range(max_turns):
        client.post(f"/api/campaigns/{campaign_id}/advance")
        pending = client.get(f"/api/campaigns/{campaign_id}/vignettes/pending").json()
        if pending["vignettes"]:
            return pending["vignettes"][0]
    return None


def _fire_with_eligible_squadron(client, seed=7, max_turns=40):
    c = _create_campaign(client, seed=seed)
    for _ in range(max_turns):
        v = _advance_until_vignette(client, c["id"], max_turns=1)
        if v is None:
            continue
        eligible = v["planning_state"]["eligible_squadrons"]
        if eligible:
            return c["id"], v
    return c["id"], None


def _interactive_commit_body(v):
    eligible = v["planning_state"]["eligible_squadrons"]
    roe_options = v["planning_state"]["roe_options"]
    sq = eligible[0]
    return {
        "squadrons": [{"squadron_id": sq["squadron_id"], "airframes": min(4, sq["airframes_available"])}],
        "support": {"awacs": True, "tanker": False, "sead_package": False},
        "roe": roe_options[0],
        "mode": "interactive",
    }


def test_interactive_commit_sets_engaged(client):
    campaign_id, v = _fire_with_eligible_squadron(client)
    if v is None:
        pytest.skip("no eligible-squadron vignette fired for this seed")
    body = _interactive_commit_body(v)
    r = client.post(f"/api/campaigns/{campaign_id}/vignettes/{v['id']}/commit", json=body)
    assert r.status_code == 200
    assert r.json()["status"] == "engaged"


def test_briefing_returns_committed_squadrons_and_depots(client):
    campaign_id, v = _fire_with_eligible_squadron(client)
    if v is None:
        pytest.skip("no eligible-squadron vignette fired for this seed")
    body = _interactive_commit_body(v)
    client.post(f"/api/campaigns/{campaign_id}/vignettes/{v['id']}/commit", json=body)

    r = client.get(f"/api/campaigns/{campaign_id}/vignettes/{v['id']}/engagement-briefing")
    assert r.status_code == 200
    data = r.json()
    assert data["vignette_id"] == v["id"]
    assert len(data["player_squadrons"]) == 1
    sq = data["player_squadrons"][0]
    assert sq["id"] == body["squadrons"][0]["squadron_id"]
    assert "depot" in sq
    assert data["adversary"]


def test_briefing_404_unknown_vignette(client):
    c = _create_campaign(client)
    r = client.get(f"/api/campaigns/{c['id']}/vignettes/99999/engagement-briefing")
    assert r.status_code == 404


def test_briefing_409_when_not_engaged(client):
    campaign_id, v = _fire_with_eligible_squadron(client)
    if v is None:
        pytest.skip("no eligible-squadron vignette fired for this seed")
    # still pending — never committed
    r = client.get(f"/api/campaigns/{campaign_id}/vignettes/{v['id']}/engagement-briefing")
    assert r.status_code == 409


def test_result_resolves_vignette_with_merged_outcome(client):
    campaign_id, v = _fire_with_eligible_squadron(client)
    if v is None:
        pytest.skip("no eligible-squadron vignette fired for this seed")
    commit_body = _interactive_commit_body(v)
    client.post(f"/api/campaigns/{campaign_id}/vignettes/{v['id']}/commit", json=commit_body)

    player_sqid = commit_body["squadrons"][0]["squadron_id"]
    result_body = {
        "player_squadron_id": player_sqid,
        "flight_kills": {},
        "flight_losses": 0,
        "munitions_expended": {},
        "flares_used": 0,
        "disengaged": False,
    }
    r = client.post(
        f"/api/campaigns/{campaign_id}/vignettes/{v['id']}/engagement-result",
        json=result_body,
    )
    assert r.status_code == 200
    resolved = r.json()
    assert resolved["status"] == "resolved"
    assert resolved["outcome"]["interactive"] is True
    assert resolved["event_trace"][0]["kind"] == "engagement_player_flight"


def test_result_409_when_not_engaged(client):
    campaign_id, v = _fire_with_eligible_squadron(client)
    if v is None:
        pytest.skip("no eligible-squadron vignette fired for this seed")
    player_sqid = v["planning_state"]["eligible_squadrons"][0]["squadron_id"]
    result_body = {
        "player_squadron_id": player_sqid,
        "flight_kills": {},
        "flight_losses": 0,
        "munitions_expended": {},
        "flares_used": 0,
        "disengaged": False,
    }
    r = client.post(
        f"/api/campaigns/{campaign_id}/vignettes/{v['id']}/engagement-result",
        json=result_body,
    )
    assert r.status_code == 409


def test_result_404_unknown_vignette(client):
    c = _create_campaign(client)
    result_body = {
        "player_squadron_id": 1,
        "flight_kills": {},
        "flight_losses": 0,
        "munitions_expended": {},
        "flares_used": 0,
        "disengaged": False,
    }
    r = client.post(
        f"/api/campaigns/{c['id']}/vignettes/99999/engagement-result",
        json=result_body,
    )
    assert r.status_code == 404


def test_result_422_on_caps_violation(client):
    campaign_id, v = _fire_with_eligible_squadron(client)
    if v is None:
        pytest.skip("no eligible-squadron vignette fired for this seed")
    commit_body = _interactive_commit_body(v)
    client.post(f"/api/campaigns/{campaign_id}/vignettes/{v['id']}/commit", json=commit_body)

    player_sqid = commit_body["squadrons"][0]["squadron_id"]
    result_body = {
        "player_squadron_id": player_sqid,
        "flight_kills": {},
        "flight_losses": 999,
        "munitions_expended": {},
        "flares_used": 0,
        "disengaged": False,
    }
    r = client.post(
        f"/api/campaigns/{campaign_id}/vignettes/{v['id']}/engagement-result",
        json=result_body,
    )
    assert r.status_code == 422
