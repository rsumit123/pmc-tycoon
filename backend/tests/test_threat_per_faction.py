"""Per-faction threat rolls yield higher combined vignette frequency."""
import random

from app.engine.vignette.threat import (
    threat_curve_prob,
    threat_curve_prob_for_faction,
    should_fire_vignette_for_faction,
    any_faction_fires,
)


def test_plaaf_prob_matches_base_curve():
    p = threat_curve_prob(2031, 1)
    p_plaaf = threat_curve_prob_for_faction("PLAAF", 2031, 1)
    assert p == p_plaaf


def test_paf_prob_is_lower_than_plaaf():
    p_plaaf = threat_curve_prob_for_faction("PLAAF", 2031, 1)
    p_paf = threat_curve_prob_for_faction("PAF", 2031, 1)
    assert p_paf < p_plaaf


def test_plan_prob_is_lowest_early_higher_late():
    early = threat_curve_prob_for_faction("PLAN", 2026, 2)
    late = threat_curve_prob_for_faction("PLAN", 2036, 1)
    assert late > early


def test_should_fire_vignette_for_faction_deterministic():
    rng = random.Random(1234)
    r1 = should_fire_vignette_for_faction(rng, "PLAAF", 2031, 1)
    rng2 = random.Random(1234)
    r2 = should_fire_vignette_for_faction(rng2, "PLAAF", 2031, 1)
    assert r1 == r2


def test_any_faction_fires_at_midcampaign_has_higher_rate():
    hits_any = 0
    hits_plaaf = 0
    for seed in range(1000):
        r = random.Random(seed)
        hits_any += 1 if any_faction_fires(r, 2031, 1) else 0
        r2 = random.Random(seed)
        hits_plaaf += 1 if should_fire_vignette_for_faction(r2, "PLAAF", 2031, 1) else 0
    assert hits_any > hits_plaaf
