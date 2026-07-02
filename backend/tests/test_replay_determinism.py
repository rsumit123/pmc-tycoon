from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from app.auth.deps import get_current_user
from main import app


def _make_client():
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
    return TestClient(app), engine


def _run_scenario(client, seed: int) -> dict:
    """Create a campaign with a fixed seed, take the same actions, advance 10 turns."""
    created = client.post("/api/campaigns", json={
        "name": "Det", "difficulty": "realistic", "objectives": [],
        "seed": seed,
    }).json()
    campaign_id = created["id"]

    # Action 1: lock in an allocation
    client.post(f"/api/campaigns/{campaign_id}/budget", json={"allocation": {
        "rd": 80000, "acquisition": 40000, "om": 20000, "spares": 10000, "infrastructure": 5000,
    }})

    # Action 2: start an extra R&D program
    client.post(f"/api/campaigns/{campaign_id}/rd", json={
        "program_id": "ghatak_ucav", "funding_level": "accelerated",
    })

    # Advance 10 quarters
    for _ in range(10):
        client.post(f"/api/campaigns/{campaign_id}/advance")

    final = client.get(f"/api/campaigns/{campaign_id}").json()
    intel_body = client.get(f"/api/campaigns/{campaign_id}/intel?limit=500").json()
    adv_body = client.get(f"/api/campaigns/{campaign_id}/adversary").json()
    # Collect the deterministic-relevant slices
    final["_intel_fingerprint"] = [
        (c["appeared_year"], c["appeared_quarter"], c["source_type"],
         c["payload"]["headline"], c["truth_value"])
        for c in intel_body["cards"]
    ]
    final["_adversary_fingerprint"] = {
        f["faction"]: f["state"]
        for f in adv_body["factions"]
    }
    vig_body = client.get(f"/api/campaigns/{campaign_id}/vignettes/pending").json()
    final["_pending_vignettes"] = [
        (v["year"], v["quarter"], v["scenario_id"],
         v["planning_state"].get("ao", {}).get("lat"),
         v["planning_state"].get("ao", {}).get("lon"))
        for v in vig_body["vignettes"]
    ]
    return final


def test_replay_via_two_independent_runs():
    client_a, eng_a = _make_client()
    final_a = _run_scenario(client_a, seed=20260415)
    # Only release the per-run DB override -- preserve the autouse auth override.
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=eng_a)

    client_b, eng_b = _make_client()
    final_b = _run_scenario(client_b, seed=20260415)
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=eng_b)

    fields = [
        "current_year", "current_quarter", "budget_cr", "current_allocation_json",
        "_intel_fingerprint", "_adversary_fingerprint",
        "_pending_vignettes",
    ]
    for f in fields:
        assert final_a[f] == final_b[f], f"mismatch on {f}"


def _run_interactive_scenario(client, seed: int, max_turns: int = 40) -> dict:
    """Mirror _run_scenario's setup, but resolve the first fired combat
    vignette (that has an eligible squadron) via the interactive path:
    commit(mode="interactive") then submit_engagement_result with a payload
    built deterministically from that DB's own vignette/campaign state.
    Then keep advancing to the same total turn count as _run_scenario.
    """
    created = client.post("/api/campaigns", json={
        "name": "DetInteractive", "difficulty": "realistic", "objectives": [],
        "seed": seed,
    }).json()
    campaign_id = created["id"]

    client.post(f"/api/campaigns/{campaign_id}/budget", json={"allocation": {
        "rd": 80000, "acquisition": 40000, "om": 20000, "spares": 10000, "infrastructure": 5000,
    }})
    client.post(f"/api/campaigns/{campaign_id}/rd", json={
        "program_id": "ghatak_ucav", "funding_level": "accelerated",
    })

    resolved_interactively = False
    for _ in range(max_turns):
        client.post(f"/api/campaigns/{campaign_id}/advance")
        pending = client.get(f"/api/campaigns/{campaign_id}/vignettes/pending").json()
        if not pending["vignettes"]:
            continue
        v = pending["vignettes"][0]
        eligible = v["planning_state"]["eligible_squadrons"]
        if not eligible:
            continue
        sq = eligible[0]
        commit_body = {
            "squadrons": [{"squadron_id": sq["squadron_id"],
                            "airframes": min(4, sq["airframes_available"])}],
            "support": {"awacs": True, "tanker": True, "sead_package": False},
            "roe": v["planning_state"]["roe_options"][0],
            "mode": "interactive",
        }
        commit_resp = client.post(
            f"/api/campaigns/{campaign_id}/vignettes/{v['id']}/commit", json=commit_body,
        )
        assert commit_resp.status_code == 200, commit_resp.text
        assert commit_resp.json()["status"] == "engaged"

        # Build the engagement-result payload deterministically from the
        # vignette's own (already-committed) state -- identical on any DB
        # replayed with the same seed and the same prior actions.
        adversary_force = v["planning_state"].get("adversary_force", [])
        flight_kills = {}
        if adversary_force:
            first = adversary_force[0]
            flight_kills = {first["platform_id"]: 1}
        result_body = {
            "player_squadron_id": sq["squadron_id"],
            "flight_kills": flight_kills,
            "flight_losses": 0,
            "munitions_expended": {},
            "flares_used": 0,
            "disengaged": False,
        }
        result_resp = client.post(
            f"/api/campaigns/{campaign_id}/vignettes/{v['id']}/engagement-result",
            json=result_body,
        )
        assert result_resp.status_code == 200
        assert result_resp.json()["status"] == "resolved"
        resolved_interactively = True
        break

    if not resolved_interactively:
        import pytest
        pytest.skip("no eligible-squadron combat vignette fired for this seed")

    # Keep advancing so the two runs cover the same total turn count as
    # test_replay_via_two_independent_runs (10 turns of gameplay).
    for _ in range(10):
        client.post(f"/api/campaigns/{campaign_id}/advance")

    final = client.get(f"/api/campaigns/{campaign_id}").json()
    intel_body = client.get(f"/api/campaigns/{campaign_id}/intel?limit=500").json()
    adv_body = client.get(f"/api/campaigns/{campaign_id}/adversary").json()
    final["_intel_fingerprint"] = [
        (c["appeared_year"], c["appeared_quarter"], c["source_type"],
         c["payload"]["headline"], c["truth_value"])
        for c in intel_body["cards"]
    ]
    final["_adversary_fingerprint"] = {
        f["faction"]: f["state"]
        for f in adv_body["factions"]
    }
    vig_body = client.get(f"/api/campaigns/{campaign_id}/vignettes/pending").json()
    final["_pending_vignettes"] = [
        (v["year"], v["quarter"], v["scenario_id"],
         v["planning_state"].get("ao", {}).get("lat"),
         v["planning_state"].get("ao", {}).get("lon"))
        for v in vig_body["vignettes"]
    ]
    return final


def test_replay_holds_for_recorded_interactive_results():
    """Two independent in-memory DBs, same seed, same action sequence,
    where the first eligible combat vignette is resolved via the interactive
    engagement path (commit mode="interactive" + submit_engagement_result
    with an identical recorded payload on both DBs) must still produce
    identical campaign fingerprints. Recording a real player action is a
    deterministic input, same as any other player action already covered
    by test_replay_via_two_independent_runs.
    """
    client_a, eng_a = _make_client()
    final_a = _run_interactive_scenario(client_a, seed=20260415)
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=eng_a)

    client_b, eng_b = _make_client()
    final_b = _run_interactive_scenario(client_b, seed=20260415)
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=eng_b)

    fields = [
        "current_year", "current_quarter", "budget_cr", "current_allocation_json",
        "_intel_fingerprint", "_adversary_fingerprint",
        "_pending_vignettes",
    ]
    for f in fields:
        assert final_a[f] == final_b[f], f"mismatch on {f}"


def test_advance_turn_does_not_create_llm_rows():
    """Plan 5 keeps LLM generation out of advance_turn. The llm_cache and
    campaign_narratives tables must remain empty after gameplay, regardless
    of how many turns advance.
    """
    from sqlalchemy.orm import sessionmaker
    from app.models.llm_cache import LLMCache
    from app.models.campaign_narrative import CampaignNarrative

    client, eng = _make_client()
    try:
        _run_scenario(client, seed=7777)
        S = sessionmaker(bind=eng)
        db = S()
        assert db.query(LLMCache).count() == 0
        assert db.query(CampaignNarrative).count() == 0
        db.close()
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
