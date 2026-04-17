import random

from app.engine.vignette.threat import threat_curve_prob, should_fire_vignette


def test_prob_at_campaign_start_is_15_percent():
    assert threat_curve_prob(2026, 2) == 0.15


def test_prob_at_campaign_end_is_55_percent():
    assert abs(threat_curve_prob(2036, 1) - 0.55) < 1e-9


def test_prob_mid_campaign_is_near_35_percent():
    # q_index = (2031 - 2026)*4 + (1-2) = 19 -> 0.15 + 19/40 * 0.40 = 0.34
    p = threat_curve_prob(2031, 1)
    assert 0.33 <= p <= 0.36


def test_prob_clamps_before_campaign():
    assert threat_curve_prob(2024, 1) == 0.15


def test_prob_clamps_after_campaign():
    assert threat_curve_prob(2040, 1) == 0.55


def test_should_fire_returns_bool():
    rng = random.Random(0)
    result = should_fire_vignette(rng, 2026, 2)
    assert isinstance(result, bool)


def test_should_fire_deterministic_with_same_rng():
    a = [should_fire_vignette(random.Random(i), 2030, 1) for i in range(50)]
    b = [should_fire_vignette(random.Random(i), 2030, 1) for i in range(50)]
    assert a == b


def test_should_fire_rate_approximately_matches_curve():
    # Over 2000 trials at q_index=19 (expected ~0.34) the observed rate
    # should land within [0.28, 0.40] (3-sigma).
    year, quarter = 2031, 1
    hits = sum(
        1 for seed in range(2000)
        if should_fire_vignette(random.Random(seed), year, quarter)
    )
    rate = hits / 2000
    assert 0.28 <= rate <= 0.40, f"fire rate {rate:.3f} outside [0.28, 0.40]"
