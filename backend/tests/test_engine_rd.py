import random

from app.engine.rd import tick_rd, FUNDING_FACTORS, MILESTONES


def _spec(program_id="amca_mk1", duration=36, cost=150000):
    return {
        "id": program_id,
        "name": program_id,
        "description": "",
        "base_duration_quarters": duration,
        "base_cost_cr": cost,
        "dependencies": [],
    }


def _state(program_id="amca_mk1", progress=0, funding="standard", milestones=None,
           cost_invested=0, quarters_active=0, status="active"):
    return {
        "program_id": program_id,
        "progress_pct": progress,
        "funding_level": funding,
        "milestones_hit": list(milestones or []),
        "cost_invested_cr": cost_invested,
        "quarters_active": quarters_active,
        "status": status,
    }


def test_funding_factors_match_locked_design():
    assert FUNDING_FACTORS["slow"] == (0.5, 0.5)
    assert FUNDING_FACTORS["standard"] == (1.0, 1.0)
    assert FUNDING_FACTORS["accelerated"] == (1.5, 1.4)


def test_milestone_thresholds_are_25_50_75_100():
    assert MILESTONES == [25, 50, 75, 100]


def test_standard_funding_advances_one_step():
    specs = {"amca_mk1": _spec(duration=20, cost=20000)}  # 5%/qtr, 1000cr/qtr
    rng = random.Random(0)
    out, events = tick_rd([_state()], specs, rd_bucket_cr=10000, rng=rng)
    assert out[0]["progress_pct"] == 5
    assert out[0]["cost_invested_cr"] == 1000
    assert out[0]["quarters_active"] == 1


def test_slow_funding_halves_progress_and_cost():
    specs = {"amca_mk1": _spec(duration=20, cost=20000)}
    rng = random.Random(0)
    out, _ = tick_rd([_state(funding="slow")], specs, rd_bucket_cr=10000, rng=rng)
    # 5% standard -> 2.5% slow, integer floor = 2
    assert out[0]["progress_pct"] == 2
    assert out[0]["cost_invested_cr"] == 500


def test_accelerated_funding_speeds_up_with_efficiency_penalty():
    specs = {"amca_mk1": _spec(duration=20, cost=20000)}
    rng = random.Random(0)
    out, _ = tick_rd([_state(funding="accelerated")], specs, rd_bucket_cr=10000, rng=rng)
    assert out[0]["progress_pct"] == 7  # int(5 * 1.4) = 7
    assert out[0]["cost_invested_cr"] == 1500  # 1000 * 1.5


def test_completed_program_is_skipped():
    specs = {"amca_mk1": _spec()}
    rng = random.Random(0)
    out, events = tick_rd(
        [_state(progress=100, status="completed")],
        specs, rd_bucket_cr=10000, rng=rng,
    )
    assert out[0]["progress_pct"] == 100
    assert out[0]["quarters_active"] == 0  # not advanced
    assert not any(e["event_type"] == "rd_progressed" for e in events)


def test_completion_emits_event_and_marks_completed():
    specs = {"amca_mk1": _spec(duration=4, cost=4000)}  # 25%/qtr
    rng = random.Random(0)
    state = _state(progress=75)
    out, events = tick_rd([state], specs, rd_bucket_cr=10000, rng=rng)
    assert out[0]["progress_pct"] == 100
    assert out[0]["status"] == "completed"
    assert any(e["event_type"] == "rd_completed" for e in events)


def test_milestone_crossing_emits_event():
    specs = {"amca_mk1": _spec(duration=4, cost=4000)}  # 25%/qtr
    rng = random.Random(0)  # forced deterministic
    out, events = tick_rd([_state(progress=20)], specs, rd_bucket_cr=10000, rng=rng)
    # 20 -> 45 crosses the 25 threshold
    assert any(e["event_type"] == "rd_milestone" and e["payload"]["threshold"] == 25 for e in events)


def test_underfunded_bucket_pro_rates_progress():
    specs = {
        "a": _spec("a", duration=10, cost=10000),  # standard cost = 1000/qtr
        "b": _spec("b", duration=10, cost=10000),  # standard cost = 1000/qtr
    }
    rng = random.Random(0)
    states = [_state("a"), _state("b")]
    # Only 1000 cr in bucket; needed 2000. Pro-rata = 0.5x
    out, events = tick_rd(states, specs, rd_bucket_cr=1000, rng=rng)
    assert out[0]["cost_invested_cr"] == 500
    assert out[1]["cost_invested_cr"] == 500
    # progress halved: 10% standard -> 5%
    assert out[0]["progress_pct"] == 5
    assert any(e["event_type"] == "rd_underfunded" for e in events)


def test_cancelled_program_is_skipped():
    specs = {"a": _spec("a")}
    rng = random.Random(0)
    out, events = tick_rd([_state("a", status="cancelled")], specs, rd_bucket_cr=10000, rng=rng)
    assert out[0]["progress_pct"] == 0
    assert out[0]["cost_invested_cr"] == 0


def test_deterministic_with_same_rng():
    specs = {"a": _spec("a", duration=4, cost=4000)}  # 25%/qtr; lots of milestone rolls
    rng_a = random.Random(99)
    rng_b = random.Random(99)
    out_a, ev_a = tick_rd([_state("a", progress=20)], specs, rd_bucket_cr=10000, rng=rng_a)
    out_b, ev_b = tick_rd([_state("a", progress=20)], specs, rd_bucket_cr=10000, rng=rng_b)
    assert out_a == out_b
    assert ev_a == ev_b
