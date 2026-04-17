from app.engine.turn import advance, EngineResult


def _spec(program_id, duration=20, cost=20000):
    return {
        "id": program_id,
        "name": program_id,
        "description": "",
        "base_duration_quarters": duration,
        "base_cost_cr": cost,
        "dependencies": [],
    }


def _ctx(seed=42, year=2026, quarter=2, treasury=620000, grant=155000, allocation=None,
         programs=None, orders=None, squadrons=None, specs=None):
    return {
        "seed": seed,
        "year": year,
        "quarter": quarter,
        "treasury_cr": treasury,
        "quarterly_grant_cr": grant,
        "current_allocation_json": allocation,
        "rd_states": programs or [],
        "acquisition_orders": orders or [],
        "squadrons": squadrons or [],
        "rd_specs": specs or {},
    }


def test_returns_engine_result():
    result = advance(_ctx())
    assert isinstance(result, EngineResult)


def test_advances_quarter_within_year():
    result = advance(_ctx(year=2026, quarter=2))
    assert (result.next_year, result.next_quarter) == (2026, 3)


def test_advances_year_at_q4_rollover():
    result = advance(_ctx(year=2026, quarter=4))
    assert (result.next_year, result.next_quarter) == (2027, 1)


def test_treasury_grows_by_grant_minus_spend():
    ctx = _ctx(treasury=100000, grant=155000, allocation=None)  # default split
    result = advance(ctx)
    # No programs, no orders, no squadrons -> nothing actually consumes the buckets
    # but the orchestrator deducts the allocation from treasury regardless
    assert result.next_treasury_cr == 100000 + 155000 - sum({
        "rd": 38750, "acquisition": 54250, "om": 31000, "spares": 23250, "infrastructure": 7750
    }.values())


def test_emits_turn_advanced_event():
    result = advance(_ctx())
    types = [e["event_type"] for e in result.events]
    assert "turn_advanced" in types


def test_runs_rd_subsystem():
    specs = {"a": _spec("a")}
    states = [{
        "program_id": "a", "progress_pct": 0, "funding_level": "standard",
        "milestones_hit": [], "cost_invested_cr": 0, "quarters_active": 0,
        "status": "active",
    }]
    result = advance(_ctx(programs=states, specs=specs))
    assert result.next_rd_states[0]["progress_pct"] > 0


def test_runs_acquisition_subsystem():
    orders = [{
        "id": 1, "platform_id": "rafale_f4", "quantity": 12,
        "first_delivery_year": 2026, "first_delivery_quarter": 2,
        "foc_year": 2027, "foc_quarter": 1,
        "delivered": 0, "total_cost_cr": 12000,
    }]
    result = advance(_ctx(year=2026, quarter=2, orders=orders))
    assert result.next_acquisition_orders[0]["delivered"] >= 1


def test_runs_readiness_subsystem():
    sqs = [{"id": 1, "readiness_pct": 50}]
    # Default allocation gives O&M=20% of 155000 = 31000, spares=15%=23250 -> well above baseline
    result = advance(_ctx(squadrons=sqs))
    assert result.next_squadrons[0]["readiness_pct"] > 50


def test_deterministic_with_same_inputs():
    specs = {"a": _spec("a", duration=4, cost=4000)}
    states = [{
        "program_id": "a", "progress_pct": 20, "funding_level": "standard",
        "milestones_hit": [], "cost_invested_cr": 0, "quarters_active": 0,
        "status": "active",
    }]
    a = advance(_ctx(programs=states, specs=specs))
    b = advance(_ctx(programs=states, specs=specs))
    assert a.events == b.events
    assert a.next_rd_states == b.next_rd_states


def test_invalid_allocation_raises():
    from app.engine.budget import AllocationError
    bad = {"rd": 999_999_999, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0}
    import pytest
    with pytest.raises(AllocationError):
        advance(_ctx(allocation=bad))


def test_adversary_subsystem_runs_and_returns_updated_states():
    from app.content.loader import RoadmapEvent, RoadmapEffect
    specs = {}
    ctx = _ctx(
        year=2026, quarter=3,
        programs=[], orders=[], squadrons=[], specs=specs,
    )
    ctx["adversary_states"] = {
        "PLAAF": {"inventory": {"j20a": 500}, "doctrine": "conservative",
                  "active_systems": [], "forward_bases": ["hotan"]},
    }
    ctx["adversary_roadmap"] = [
        RoadmapEvent(year=2026, quarter=3, faction="PLAAF",
                     effect=RoadmapEffect(kind="inventory_delta", payload={"j20a": 60})),
    ]
    ctx["intel_templates"] = []
    result = advance(ctx)
    assert result.next_adversary_states["PLAAF"]["inventory"]["j20a"] == 560


def test_intel_subsystem_generates_cards():
    from app.content.loader import IntelTemplate
    ctx = _ctx(year=2026, quarter=3)
    ctx["adversary_states"] = {
        "PLAAF": {"inventory": {"j20a": 500}, "doctrine": "conservative",
                  "active_systems": [], "forward_bases": ["hotan"]},
    }
    ctx["adversary_roadmap"] = []
    ctx["intel_templates"] = [
        IntelTemplate(id=f"t{i}", faction="PLAAF", source_types=["IMINT"],
                      headline_template="{count} J-20A observed",
                      subject_type="force_count",
                      payload_keys={"count": {"source": "inventory", "key": "j20a"}},
                      trigger=None)
        for i in range(6)
    ]
    result = advance(ctx)
    assert 4 <= len(result.new_intel_cards) <= 7


def test_doctrine_progression_runs_after_adversary_tick():
    ctx = _ctx(year=2028, quarter=1)
    ctx["adversary_states"] = {
        "PLAAF": {"inventory": {"j20a": 680, "j35a": 100},
                  "doctrine": "conservative",
                  "active_systems": [], "forward_bases": []},
    }
    ctx["adversary_roadmap"] = []
    ctx["intel_templates"] = []
    result = advance(ctx)
    assert result.next_adversary_states["PLAAF"]["doctrine"] == "integrated_ew"
    assert any(e["event_type"] == "adversary_doctrine_shifted" for e in result.events)


def test_missing_adversary_ctx_keys_default_to_empty():
    """Existing tests don't pass adversary_states / roadmap / templates —
    advance() should fall back to empty defaults gracefully."""
    ctx = _ctx(year=2026, quarter=2)
    # Do NOT set adversary_states / adversary_roadmap / intel_templates
    result = advance(ctx)
    assert result.next_adversary_states == {}
    assert result.new_intel_cards == []
