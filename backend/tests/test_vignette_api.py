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


def _valid_commit(eligible_squadrons, roe_options=None, roe_override=None):
    sq = eligible_squadrons[0]
    if roe_override:
        roe = roe_override
    elif roe_options:
        roe = roe_options[0]
    else:
        roe = "weapons_free"
    return {
        "squadrons": [{"squadron_id": sq["squadron_id"], "airframes": min(4, sq["airframes_available"])}],
        "support": {"awacs": True, "tanker": False, "sead_package": False},
        "roe": roe,
    }


def test_allows_no_cap_permits_zero_squadron_commit(client):
    """Plan 19: when planning_state.allows_no_cap=True, committing with an
    empty squadrons list (AD-only defense) must not raise
    CommitValidationError."""
    from app.crud.vignette import commit_vignette
    from app.models.campaign import Campaign
    from app.models.vignette import Vignette
    from app.api.deps import get_db

    c = _create_campaign(client, seed=11)
    # Build an AD-only vignette directly via the overridden session.
    db_gen = app.dependency_overrides[get_db]()
    db = next(db_gen)
    try:
        campaign = db.query(Campaign).filter_by(id=c["id"]).first()
        planning_state = {
            "scenario_id": "plan_cruise_coastal",
            "scenario_name": "AD-Only Test",
            "ao": {"region": "coast", "name": "Thanjavur vicinity",
                   "lat": 10.77, "lon": 79.1},
            "response_clock_minutes": 30,
            "adversary_force": [
                {"role": "strike", "faction": "PLAN",
                 "platform_id": "yj21_missile", "count": 4, "loadout": []},
            ],
            "adversary_force_observed": [],
            "intel_quality": {"tier": "medium", "score": 0.5},
            "awacs_covering": [], "isr_covering": [],
            "eligible_squadrons": [],
            "allowed_ind_roles": ["CAP", "awacs"],
            "roe_options": ["weapons_free", "weapons_tight"],
            "objective": {"kind": "defend_airspace",
                          "success_threshold": {"adv_kills_min": 2, "ind_losses_max": 4}},
            "ad_batteries": [], "ad_specs": {}, "bases_registry": {},
            "allows_no_cap": True,
        }
        v = Vignette(
            campaign_id=campaign.id, year=2026, quarter=3,
            scenario_id="plan_cruise_coastal", status="pending",
            planning_state=planning_state,
        )
        db.add(v)
        db.commit()
        db.refresh(v)
        # Empty squadrons — AD defends alone.
        body = {"squadrons": [], "support": {}, "roe": "weapons_free"}
        # Should NOT raise — this is the Plan 19 semantic.
        resolved = commit_vignette(db, campaign, v, body)
        assert resolved.status == "resolved"
    finally:
        db.close()


def test_commit_resolves_vignette(client):
    c = _create_campaign(client, seed=7)
    v = _advance_until_vignette(client, c["id"])
    assert v is not None
    eligible = v["planning_state"]["eligible_squadrons"]
    if not eligible:
        pytest.skip("no eligible squadron for this seed")
    roe_options = v["planning_state"]["roe_options"]
    body = _valid_commit(eligible, roe_options=roe_options)
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
    roe_options = v["planning_state"]["roe_options"]
    body = _valid_commit(eligible, roe_options=roe_options)
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
    roe_options1 = v1["planning_state"]["roe_options"]
    body1 = _valid_commit(eligible1, roe_options=roe_options1)
    r1 = client.post(f"/api/campaigns/{c1['id']}/vignettes/{v1['id']}/commit", json=body1)
    outcome1 = r1.json()["outcome"]

    c2 = _create_campaign(client, seed=7)
    v2 = _advance_until_vignette(client, c2["id"])
    assert v2 is not None
    eligible2 = v2["planning_state"]["eligible_squadrons"]
    roe_options2 = v2["planning_state"]["roe_options"]
    body2 = _valid_commit(eligible2, roe_options=roe_options2)
    r2 = client.post(f"/api/campaigns/{c2['id']}/vignettes/{v2['id']}/commit", json=body2)
    outcome2 = r2.json()["outcome"]

    assert outcome1 == outcome2
