"""Intel quality scoring drives fog-of-war display of adversary force."""
from app.engine.vignette.intel_quality import score_intel_quality


def test_no_awacs_no_recent_intel_yields_low_quality():
    q = score_intel_quality(
        awacs_covering_count=0,
        recent_intel_confidences=[],
        adversary_stealth_fraction=0.0,
    )
    assert q["tier"] == "low"
    assert 0.0 <= q["score"] <= 0.30


def test_awacs_plus_high_confidence_intel_yields_high_quality():
    q = score_intel_quality(
        awacs_covering_count=2,
        recent_intel_confidences=[0.8, 0.9],
        adversary_stealth_fraction=0.0,
    )
    assert q["tier"] in ("high", "perfect")
    assert q["score"] >= 0.65


def test_high_adversary_stealth_reduces_quality():
    q_no_stealth = score_intel_quality(
        awacs_covering_count=1,
        recent_intel_confidences=[0.7],
        adversary_stealth_fraction=0.0,
    )
    q_stealth = score_intel_quality(
        awacs_covering_count=1,
        recent_intel_confidences=[0.7],
        adversary_stealth_fraction=0.75,
    )
    assert q_stealth["score"] < q_no_stealth["score"]


def test_score_is_clamped_0_1():
    q = score_intel_quality(
        awacs_covering_count=10,
        recent_intel_confidences=[1.0, 1.0, 1.0, 1.0],
        adversary_stealth_fraction=0.0,
    )
    assert q["score"] <= 1.0


def test_tier_thresholds():
    # Verify boundaries: <0.30 low, 0.30-0.65 medium, 0.65-0.90 high, ≥0.90 perfect.
    assert score_intel_quality(0, [], 0.0)["tier"] == "low"
    assert score_intel_quality(1, [0.5], 0.0)["tier"] == "medium"
    assert score_intel_quality(2, [0.8], 0.0)["tier"] == "high"
    assert score_intel_quality(2, [1.0, 1.0], 0.0)["tier"] == "perfect"


def test_isr_drones_increase_quality_score():
    q_no_isr = score_intel_quality(
        awacs_covering_count=0, recent_intel_confidences=[],
        adversary_stealth_fraction=0.0, isr_drones_covering_count=0,
    )
    q_with_isr = score_intel_quality(
        awacs_covering_count=0, recent_intel_confidences=[],
        adversary_stealth_fraction=0.0, isr_drones_covering_count=2,
    )
    assert q_with_isr["score"] > q_no_isr["score"]
    assert q_with_isr["modifiers"]["isr"] > 0


def test_isr_weight_saturates_at_two_drones():
    """Going from 2 → 4 drones should not increase ISR contribution further."""
    q2 = score_intel_quality(0, [], 0.0, isr_drones_covering_count=2)
    q4 = score_intel_quality(0, [], 0.0, isr_drones_covering_count=4)
    assert q2["modifiers"]["isr"] == q4["modifiers"]["isr"]
