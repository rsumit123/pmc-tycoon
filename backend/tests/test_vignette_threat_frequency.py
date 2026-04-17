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
    rate = _run_trials(2026, 2)
    assert 0.11 <= rate <= 0.19, f"rate={rate:.3f} outside [0.11, 0.19]"


def test_frequency_at_midcampaign():
    rate = _run_trials(2031, 1)
    expected = threat_curve_prob(2031, 1)
    assert abs(rate - expected) < 0.04


def test_frequency_at_campaign_end():
    rate = _run_trials(2036, 1)
    assert 0.51 <= rate <= 0.59, f"rate={rate:.3f} outside [0.51, 0.59]"
