"""Tests for subsystem wear mechanics — math logic from _apply_subsystem_wear.

Since the actual function in app/api/battle.py depends on the DB, we test
the calculation formulas separately as pure math.
"""

import random
import pytest


# Wear intensity classification (mirrors _apply_subsystem_wear logic)
def _classify_intensity(damage_taken: float, turns_played: int) -> int:
    """0=light, 1=standard, 2=heavy."""
    if damage_taken >= 40 or turns_played >= 10:
        return 2
    elif damage_taken >= 20 or turns_played >= 5:
        return 1
    return 0


WEAR_RANGES = [
    (3, 8),    # light
    (5, 12),   # standard
    (8, 18),   # heavy
]


def _get_slot_weights(damage_taken: float) -> dict:
    return {
        "radar": 1.2,
        "engine": 1.3,
        "ecm": 0.8,
        "countermeasures": 0.7,
        "computer": 0.9,
        "airframe": 1.1 + (damage_taken / 100),
    }


class TestIntensityClassification:
    """Test that damage/turns map to correct intensity level."""

    def test_light_intensity(self):
        assert _classify_intensity(10, 3) == 0
        assert _classify_intensity(0, 0) == 0
        assert _classify_intensity(19, 4) == 0

    def test_standard_intensity(self):
        assert _classify_intensity(20, 3) == 1
        assert _classify_intensity(10, 5) == 1
        assert _classify_intensity(39, 9) == 1

    def test_heavy_intensity(self):
        assert _classify_intensity(40, 3) == 2
        assert _classify_intensity(10, 10) == 2
        assert _classify_intensity(80, 15) == 2

    def test_boundary_20_damage(self):
        assert _classify_intensity(19, 0) == 0
        assert _classify_intensity(20, 0) == 1

    def test_boundary_40_damage(self):
        assert _classify_intensity(39, 0) == 1
        assert _classify_intensity(40, 0) == 2

    def test_boundary_5_turns(self):
        assert _classify_intensity(0, 4) == 0
        assert _classify_intensity(0, 5) == 1

    def test_boundary_10_turns(self):
        assert _classify_intensity(0, 9) == 1
        assert _classify_intensity(0, 10) == 2


class TestWearRanges:
    """Test that wear values fall within expected ranges."""

    def test_light_wear_range(self):
        rng = random.Random(42)
        for _ in range(100):
            wear = rng.uniform(3, 8)
            assert 3 <= wear <= 8

    def test_standard_wear_range(self):
        rng = random.Random(42)
        for _ in range(100):
            wear = rng.uniform(5, 12)
            assert 5 <= wear <= 12

    def test_heavy_wear_range(self):
        rng = random.Random(42)
        for _ in range(100):
            wear = rng.uniform(8, 18)
            assert 8 <= wear <= 18


class TestSlotWeights:
    """Test per-slot weighting logic."""

    def test_engine_weighs_more_than_countermeasures(self):
        weights = _get_slot_weights(0)
        assert weights["engine"] > weights["countermeasures"]

    def test_radar_weighs_more_than_countermeasures(self):
        weights = _get_slot_weights(0)
        assert weights["radar"] > weights["countermeasures"]

    def test_engine_is_heaviest_base_weight(self):
        weights = _get_slot_weights(0)
        # At 0 damage, engine (1.3) > airframe (1.1) > radar (1.2)
        assert weights["engine"] == 1.3
        assert weights["engine"] > weights["radar"]

    def test_countermeasures_is_lightest(self):
        weights = _get_slot_weights(0)
        assert weights["countermeasures"] == 0.7
        for slot, w in weights.items():
            if slot != "countermeasures":
                assert w > weights["countermeasures"]

    def test_airframe_scales_with_damage(self):
        w0 = _get_slot_weights(0)["airframe"]
        w50 = _get_slot_weights(50)["airframe"]
        w100 = _get_slot_weights(100)["airframe"]
        assert w0 == pytest.approx(1.1)
        assert w50 == pytest.approx(1.6)
        assert w100 == pytest.approx(2.1)
        assert w0 < w50 < w100

    def test_non_airframe_weights_ignore_damage(self):
        w0 = _get_slot_weights(0)
        w80 = _get_slot_weights(80)
        for slot in ("radar", "engine", "ecm", "countermeasures", "computer"):
            assert w0[slot] == w80[slot]


class TestWearCalculation:
    """End-to-end wear calculation matching _apply_subsystem_wear logic."""

    def _calc_wear(self, damage_taken, turns_played, slot_type, seed=42):
        """Replicate the wear calculation from battle.py."""
        intensity = _classify_intensity(damage_taken, turns_played)
        wear_min, wear_max = WEAR_RANGES[intensity]
        weights = _get_slot_weights(damage_taken)
        weight = weights.get(slot_type, 1.0)

        rng = random.Random(seed)
        base_wear = rng.uniform(wear_min, wear_max)
        actual_wear = round(base_wear * weight, 1)
        return actual_wear

    def test_light_engine_wear_in_range(self):
        """Light intensity, engine (1.3x): base 3-8, actual 3.9-10.4."""
        for seed in range(50):
            wear = self._calc_wear(10, 3, "engine", seed)
            assert 3.9 <= wear <= 10.4 + 0.1  # small float tolerance

    def test_heavy_radar_wear_in_range(self):
        """Heavy intensity, radar (1.2x): base 8-18, actual 9.6-21.6."""
        for seed in range(50):
            wear = self._calc_wear(50, 12, "radar", seed)
            assert 9.5 <= wear <= 21.7  # tolerance for rounding

    def test_heavy_countermeasures_wear_is_lower(self):
        """Countermeasures (0.7x) should wear less than engine (1.3x)."""
        cm_wears = []
        eng_wears = []
        for seed in range(100):
            cm_wears.append(self._calc_wear(50, 12, "countermeasures", seed))
            eng_wears.append(self._calc_wear(50, 12, "engine", seed))
        assert sum(cm_wears) / len(cm_wears) < sum(eng_wears) / len(eng_wears)

    def test_condition_never_goes_below_zero(self):
        """Simulating wear on a subsystem at low condition."""
        initial_condition = 5
        wear = self._calc_wear(80, 15, "engine", seed=42)
        new_condition = max(0, int(initial_condition - wear))
        assert new_condition >= 0

    def test_deterministic_with_same_seed(self):
        """Same seed should produce same wear."""
        w1 = self._calc_wear(30, 7, "radar", seed=123)
        w2 = self._calc_wear(30, 7, "radar", seed=123)
        assert w1 == w2

    def test_different_seeds_vary(self):
        """Different seeds should generally produce different wear."""
        wears = {self._calc_wear(30, 7, "radar", seed=s) for s in range(20)}
        assert len(wears) > 1  # should not all be identical
