"""Monte Carlo check that the threat curve produces vignette firings at
roughly the target rate. Runs 1000 advance calls each at q_index 0,
20, 39 and checks the observed rate against the curve.
"""

import random
from app.engine.vignette.threat import should_fire_vignette, threat_curve_prob


def _run_trials(year, quarter, n=1000):
    hits = sum(
        1 for seed in range(n)
        if should_fire_vignette(random.Random(seed), year, quarter)
    )
    return hits / n


def test_frequency_at_campaign_start():
    # any_faction_fires at q_index=0: PLAAF 0.20, PAF 0.14, PLAN 0.05
    # P(at least one) = 1 - (0.8 * 0.86 * 0.95) ≈ 0.36
    rate = _run_trials(2026, 2)
    assert 0.30 <= rate <= 0.42, f"rate={rate:.3f} outside [0.30, 0.42]"


def test_frequency_at_midcampaign():
    # any_faction_fires: PLAAF ~0.37, PAF ~0.26, PLAN ~0.25
    # P(at least one) ≈ 1 - (0.63 * 0.74 * 0.75) ≈ 0.65; observed ~0.666
    rate = _run_trials(2031, 1)
    expected = threat_curve_prob(2031, 1)  # This is PLAAF single-roll; not used for composite check
    # Instead, check that the any_faction composite rate is significantly higher
    assert 0.60 <= rate <= 0.72, f"rate={rate:.3f} outside [0.60, 0.72]"


def test_frequency_at_campaign_end():
    # any_faction_fires at q_index=39: PLAAF 0.55, PAF 0.385, PLAN 0.45
    # P(at least one) ≈ 1 - (0.45 * 0.615 * 0.55) ≈ 0.85
    rate = _run_trials(2036, 1)
    assert 0.79 <= rate <= 0.91, f"rate={rate:.3f} outside [0.79, 0.91]"
