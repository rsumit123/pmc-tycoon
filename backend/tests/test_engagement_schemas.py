from app.schemas.vignette import (
    EngagementResultPayload, VignetteCommitPayload, VignetteRead,
)


def test_commit_payload_mode_defaults_to_auto():
    p = VignetteCommitPayload(squadrons=[], roe="weapons_free")
    assert p.mode == "auto"


def test_commit_payload_accepts_interactive():
    p = VignetteCommitPayload(mode="interactive", roe="weapons_free")
    assert p.mode == "interactive"


def test_engagement_result_payload_shape():
    r = EngagementResultPayload(
        player_squadron_id=3,
        flight_kills={"jf17_blk3": 2},
        flight_losses=1,
        munitions_expended={"astra_mk1": 3},
        flares_used=2,
        disengaged=False,
    )
    assert r.flight_kills["jf17_blk3"] == 2
    assert r.flight_losses == 1


def test_vignette_read_accepts_engaged_status():
    # Literal must include "engaged"
    v = VignetteRead(
        id=1, year=2026, quarter=2, scenario_id="s", status="engaged",
        planning_state={}, committed_force=None, event_trace=[], aar_text="",
        outcome={}, resolved_at=None,
    )
    assert v.status == "engaged"
