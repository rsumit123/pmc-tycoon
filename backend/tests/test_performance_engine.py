from app.engine.performance import compute_performance


def test_empty_input_returns_zeroed_bundle():
    result = compute_performance(resolved_vignettes=[], platforms_by_id={}, weapons_by_id={})
    assert result["totals"]["total_sorties"] == 0
    assert result["totals"]["total_kills"] == 0
    assert result["totals"]["total_losses"] == 0
    assert result["totals"]["total_munitions_cost_cr"] == 0
    assert result["totals"]["avg_cost_per_kill_cr"] is None
    assert result["platforms"] == []
    assert result["weapons"] == []
    # Factions always return 3 entries in fixed order, even for empty input
    assert [f["faction"] for f in result["factions"]] == ["PLAAF", "PAF", "PLAN"]
    # Support always returns 3 entries in fixed order
    assert [s["asset"] for s in result["support"]] == ["awacs", "tanker", "sead"]


def _mkv(
    faction="PLAAF",
    objective_met=True,
    ind_airframes_lost=2,
    adv_airframes_lost=5,
    munitions_cost=100,
    event_trace=None,
    committed=None,
    support=None,
    eligible=None,
):
    """Helper to build a minimal resolved-vignette dict for aggregation tests."""
    return {
        "planning_state": {
            "adversary_force": [{"faction": faction, "platform_id": "j20a", "count": 4}],
            "eligible_squadrons": eligible or [],
        },
        "committed_force": {
            "squadrons": committed or [],
            "support": support or {"awacs": False, "tanker": False, "sead_package": False},
        },
        "event_trace": event_trace or [],
        "outcome": {
            "objective_met": objective_met,
            "ind_airframes_lost": ind_airframes_lost,
            "adv_airframes_lost": adv_airframes_lost,
            "munitions_cost_total_cr": munitions_cost,
            "munitions_expended": [],
            "support": support or {"awacs": False, "tanker": False, "sead_package": False},
        },
    }


def test_totals_aggregate_across_vignettes():
    vs = [
        _mkv(ind_airframes_lost=2, adv_airframes_lost=5, munitions_cost=100,
             event_trace=[
                 {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "j20a"},
                 {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "j20a"},
                 {"kind": "kill", "side": "adv", "attacker_platform": "j20a", "victim_platform": "rafale_f4"},
             ]),
        _mkv(ind_airframes_lost=1, adv_airframes_lost=3, munitions_cost=50,
             event_trace=[
                 {"kind": "kill", "side": "ind", "attacker_platform": "su30_mki", "victim_platform": "j16"},
             ]),
    ]
    result = compute_performance(vs, platforms_by_id={}, weapons_by_id={})
    assert result["totals"]["total_sorties"] == 2
    assert result["totals"]["total_kills"] == 3  # IAF kills (ind side)
    assert result["totals"]["total_losses"] == 1  # IAF losses (adv side kills)
    assert result["totals"]["total_munitions_cost_cr"] == 150
    # avg_cost_per_kill = 150 / 3 = 50
    assert result["totals"]["avg_cost_per_kill_cr"] == 50
