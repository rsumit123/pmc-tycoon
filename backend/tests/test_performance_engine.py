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
