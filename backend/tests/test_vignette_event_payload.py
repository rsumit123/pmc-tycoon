"""
Tests that vignette_resolved CampaignEvent payload includes ao and scenario_name.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from app.models.event import CampaignEvent
from main import app


@pytest.fixture
def client_and_db():
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
    yield TestClient(app), TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _create_campaign(client, seed=7):
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


def test_vignette_resolved_event_has_ao_and_scenario_name(client_and_db):
    client, SessionLocal = client_and_db
    c = _create_campaign(client, seed=7)
    v = _advance_until_vignette(client, c["id"])
    if v is None:
        pytest.skip("no vignette fired across 40 turns")

    eligible = v["planning_state"]["eligible_squadrons"]
    if not eligible:
        pytest.skip("no eligible squadron for this seed")

    sq = eligible[0]
    roe_options = v["planning_state"]["roe_options"]
    body = {
        "squadrons": [{"squadron_id": sq["squadron_id"], "airframes": min(4, sq["airframes_available"])}],
        "support": {"awacs": True, "tanker": False, "sead_package": False},
        "roe": roe_options[0],
    }
    r = client.post(f"/api/campaigns/{c['id']}/vignettes/{v['id']}/commit", json=body)
    assert r.status_code == 200

    # Query the CampaignEvent directly from the DB
    db = SessionLocal()
    try:
        event = db.query(CampaignEvent).filter(
            CampaignEvent.campaign_id == c["id"],
            CampaignEvent.event_type == "vignette_resolved",
        ).first()
        assert event is not None, "vignette_resolved event not found"
        payload = event.payload
        assert "ao" in payload, f"'ao' missing from payload: {payload}"
        assert "scenario_name" in payload, f"'scenario_name' missing from payload: {payload}"
        assert "outcome" in payload
        assert "vignette_id" in payload
        assert "scenario_id" in payload
    finally:
        db.close()
