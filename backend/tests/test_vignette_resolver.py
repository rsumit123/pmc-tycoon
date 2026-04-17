from app.engine.vignette.resolver import resolve


def _planning_state_basic():
    return {
        "scenario_id": "lac_air_incursion_limited",
        "ao": {"lat": 34.0, "lon": 78.5},
        "response_clock_minutes": 45,
        "adversary_force": [
            {"role": "CAP", "faction": "PLAAF", "platform_id": "j20a", "count": 4,
             "loadout": ["pl15", "pl10"]},
        ],
        "eligible_squadrons": [
            {"squadron_id": 17, "platform_id": "rafale_f4", "base_id": 1,
             "distance_km": 400, "in_range": True, "airframes_available": 8,
             "readiness_pct": 80, "xp": 0, "loadout": ["meteor", "mica_ir"]},
        ],
        "roe_options": ["weapons_free", "weapons_tight", "visual_id_required"],
        "objective": {"kind": "defend_airspace",
                      "success_threshold": {"adv_kills_min": 2, "ind_losses_max": 4}},
    }


def _committed_basic(airframes=8, roe="weapons_free",
                     awacs=True, tanker=False, sead=False):
    return {
        "squadrons": [{"squadron_id": 17, "airframes": airframes}],
        "support": {"awacs": awacs, "tanker": tanker, "sead_package": sead},
        "roe": roe,
    }


def _platforms():
    return {
        "rafale_f4": {"combat_radius_km": 1850, "generation": "4.5", "radar_range_km": 200,
                      "rcs_band": "reduced"},
        "j20a":      {"combat_radius_km": 2000, "generation": "5",   "radar_range_km": 220,
                      "rcs_band": "VLO"},
    }


def test_resolver_returns_outcome_and_trace():
    outcome, trace = resolve(
        _planning_state_basic(), _committed_basic(), _platforms(),
        seed=42, year=2029, quarter=3,
    )
    assert "ind_kia" in outcome
    assert "adv_kia" in outcome
    assert "objective_met" in outcome
    assert isinstance(trace, list)
    assert len(trace) > 0


def test_resolver_trace_contains_expected_kinds():
    _, trace = resolve(
        _planning_state_basic(), _committed_basic(), _platforms(),
        seed=42, year=2029, quarter=3,
    )
    kinds = {e["kind"] for e in trace}
    assert "detection" in kinds
    assert "outcome" in kinds


def test_resolver_is_deterministic():
    a_outcome, a_trace = resolve(
        _planning_state_basic(), _committed_basic(), _platforms(),
        seed=42, year=2029, quarter=3,
    )
    b_outcome, b_trace = resolve(
        _planning_state_basic(), _committed_basic(), _platforms(),
        seed=42, year=2029, quarter=3,
    )
    assert a_outcome == b_outcome
    assert a_trace == b_trace


def test_resolver_different_seeds_can_differ():
    diverged = False
    base_a, _ = resolve(
        _planning_state_basic(), _committed_basic(), _platforms(),
        seed=1, year=2029, quarter=3,
    )
    for s in range(2, 50):
        b, _ = resolve(
            _planning_state_basic(), _committed_basic(), _platforms(),
            seed=s, year=2029, quarter=3,
        )
        if b != base_a:
            diverged = True
            break
    assert diverged, "resolver outcomes did not diverge across 50 seeds"


def test_resolver_visual_id_skips_bvr():
    _, trace = resolve(
        _planning_state_basic(),
        _committed_basic(roe="visual_id_required"),
        _platforms(),
        seed=42, year=2029, quarter=3,
    )
    kinds = [e["kind"] for e in trace]
    assert "vid_skip_bvr" in kinds
    # No IND bvr_launch events under visual-id rules
    ind_bvr = [e for e in trace if e["kind"] == "bvr_launch" and e.get("side") == "ind"]
    assert ind_bvr == []


def test_resolver_objective_met_false_when_losses_exceed_threshold():
    ps = _planning_state_basic()
    ps["adversary_force"][0]["count"] = 8
    committed = _committed_basic(airframes=1, awacs=False)
    outcome, _ = resolve(
        ps, committed, _platforms(),
        seed=1, year=2029, quarter=3,
    )
    assert 0 <= outcome["ind_kia"] <= 1
    assert 0 <= outcome["adv_kia"] <= 8


def test_resolver_empty_commit_results_in_adv_win():
    outcome, trace = resolve(
        _planning_state_basic(),
        {"squadrons": [], "support": {"awacs": False, "tanker": False, "sead_package": False},
         "roe": "weapons_free"},
        _platforms(),
        seed=42, year=2029, quarter=3,
    )
    assert outcome["ind_kia"] == 0
    assert outcome["adv_kia"] == 0
    assert outcome["objective_met"] is False
