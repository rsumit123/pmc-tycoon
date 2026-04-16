import random

from app.engine.readiness import (
    tick_readiness,
    target_readiness,
    OM_PER_SQUADRON_BASELINE,
    SPARES_PER_SQUADRON_BASELINE,
    MIN_READINESS,
)


def _sq(sq_id=1, readiness=80):
    return {"id": sq_id, "readiness_pct": readiness}


def test_baselines_match_locked_design():
    assert OM_PER_SQUADRON_BASELINE == 1000
    assert SPARES_PER_SQUADRON_BASELINE == 500


def test_target_readiness_with_zero_funding_is_60():
    assert target_readiness(om_cr=0, spares_cr=0, n_squadrons=3) == 60


def test_target_readiness_at_baseline_is_90():
    target = target_readiness(om_cr=3000, spares_cr=1500, n_squadrons=3)
    assert target == 90


def test_target_readiness_caps_at_100():
    # 3x baseline both buckets -> combined factor 2 -> 60 + 60 = 120 -> capped 100
    target = target_readiness(om_cr=9000, spares_cr=4500, n_squadrons=3)
    assert target == 100


def test_target_readiness_no_squadrons_returns_zero():
    assert target_readiness(om_cr=1000, spares_cr=500, n_squadrons=0) == 0


def test_readiness_moves_toward_target_by_max_5():
    rng = random.Random(0)
    out, events = tick_readiness(
        [_sq(readiness=70)],
        om_cr=3000, spares_cr=1500, rng=rng,  # target=90
    )
    assert out[0]["readiness_pct"] == 75


def test_readiness_does_not_overshoot():
    rng = random.Random(0)
    # 1 sq, om=1000 spares=500 -> factor=1.0 -> target=90; from 88 step is +2
    out, events = tick_readiness(
        [_sq(readiness=88)],
        om_cr=1000, spares_cr=500, rng=rng,
    )
    assert out[0]["readiness_pct"] == 90


def test_readiness_degrades_when_underfunded():
    rng = random.Random(0)
    out, events = tick_readiness(
        [_sq(readiness=80)],
        om_cr=0, spares_cr=0, rng=rng,  # target=60 -> moves -5
    )
    assert out[0]["readiness_pct"] == 75


def test_min_readiness_floor_constant_is_20():
    # MIN_READINESS=20 is the defensive floor. In Plan 2's model, target is always
    # >=60 so a squadron is never driven below 20 by funding alone — the floor
    # exists for future plans (combat losses, sabotage events) that can knock
    # readiness down. Document its value here.
    assert MIN_READINESS == 20


def test_significant_change_emits_event():
    rng = random.Random(0)
    out, events = tick_readiness(
        [_sq(sq_id=42, readiness=70)],
        om_cr=3000, spares_cr=1500, rng=rng,  # target=90, +5
    )
    assert any(
        e["event_type"] == "readiness_changed" and e["payload"]["squadron_id"] == 42
        for e in events
    )


def test_no_squadrons_returns_empty():
    rng = random.Random(0)
    out, events = tick_readiness([], om_cr=1000, spares_cr=500, rng=rng)
    assert out == []
    assert events == []


def test_deterministic_with_same_inputs():
    rng_a = random.Random(7)
    rng_b = random.Random(7)
    a, ev_a = tick_readiness([_sq(1, 80), _sq(2, 60)], om_cr=2000, spares_cr=1000, rng=rng_a)
    b, ev_b = tick_readiness([_sq(1, 80), _sq(2, 60)], om_cr=2000, spares_cr=1000, rng=rng_b)
    assert a == b
    assert ev_a == ev_b
