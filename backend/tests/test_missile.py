"""Tests for missile kill probability calculations."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import random
from app.engine.missile import calculate_missile_pk
from app.engine.types import WeaponData


def make_weapon(**kwargs) -> WeaponData:
    defaults = dict(
        id=1, name="Test Missile", weapon_type="BVR_AAM", weight_kg=150,
        max_range_km=120, no_escape_range_km=45, min_range_km=4,
        speed_mach=4.0, guidance="active_radar", seeker_generation=4,
        base_pk=0.80, warhead_kg=18, eccm_rating=80, maneuverability_g=40,
    )
    defaults.update(kwargs)
    return WeaponData(**defaults)


def test_pk_at_rne_is_high():
    """Pk at no-escape range should be close to base Pk."""
    weapon = make_weapon(base_pk=0.80, no_escape_range_km=45, max_range_km=120)
    rng = random.Random(42)

    result = calculate_missile_pk(
        weapon=weapon, launch_range_km=45.0,
        target_ecm_rating=50, target_max_g=9.0,
        target_twr_ratio=0.9, player_modifier=1.0, rng=rng,
    )

    assert result.range_factor > 0.9, f"Range factor at Rne should be ~1.0, got {result.range_factor}"
    assert result.final_pk > 0.5, f"Pk at Rne should be high, got {result.final_pk}"
    print(f"✓ Pk at Rne ({weapon.no_escape_range_km}km): {result.final_pk:.2f} (range factor: {result.range_factor:.2f})")


def test_pk_at_rmax_is_low():
    """Pk at max range should be heavily degraded."""
    weapon = make_weapon(base_pk=0.80, no_escape_range_km=45, max_range_km=120)
    rng = random.Random(42)

    result = calculate_missile_pk(
        weapon=weapon, launch_range_km=115.0,
        target_ecm_rating=50, target_max_g=9.0,
        target_twr_ratio=0.9, player_modifier=1.0, rng=rng,
    )

    assert result.range_factor < 0.3, f"Range factor at near-Rmax should be low, got {result.range_factor}"
    assert result.final_pk < 0.4, f"Pk near Rmax should be low, got {result.final_pk}"
    print(f"✓ Pk at near-Rmax ({115}km): {result.final_pk:.2f} (range factor: {result.range_factor:.2f})")


def test_high_ecm_reduces_pk():
    """Target with high ECM rating should reduce missile Pk."""
    weapon = make_weapon(base_pk=0.80, eccm_rating=60)
    rng1 = random.Random(42)
    rng2 = random.Random(42)

    result_low_ecm = calculate_missile_pk(
        weapon=weapon, launch_range_km=45.0,
        target_ecm_rating=30, target_max_g=9.0,
        target_twr_ratio=0.9, player_modifier=1.0, rng=rng1,
    )
    result_high_ecm = calculate_missile_pk(
        weapon=weapon, launch_range_km=45.0,
        target_ecm_rating=90, target_max_g=9.0,
        target_twr_ratio=0.9, player_modifier=1.0, rng=rng2,
    )

    assert result_high_ecm.ecm_factor < result_low_ecm.ecm_factor
    assert result_high_ecm.final_pk < result_low_ecm.final_pk
    print(f"✓ ECM effect: Pk {result_low_ecm.final_pk:.2f} (ECM 30) vs {result_high_ecm.final_pk:.2f} (ECM 90)")


def test_player_modifier_affects_pk():
    """Player choice modifier should significantly affect Pk."""
    weapon = make_weapon(base_pk=0.80)
    rng1 = random.Random(42)
    rng2 = random.Random(42)

    result_good = calculate_missile_pk(
        weapon=weapon, launch_range_km=50.0,
        target_ecm_rating=50, target_max_g=9.0,
        target_twr_ratio=0.9, player_modifier=1.35, rng=rng1,
    )
    result_bad = calculate_missile_pk(
        weapon=weapon, launch_range_km=50.0,
        target_ecm_rating=50, target_max_g=9.0,
        target_twr_ratio=0.9, player_modifier=0.75, rng=rng2,
    )

    diff = result_good.final_pk - result_bad.final_pk
    assert diff > 0.15, f"Good vs bad play should differ by >15%, got {diff:.2f}"
    print(f"✓ Player agency: good play Pk {result_good.final_pk:.2f} vs bad play Pk {result_bad.final_pk:.2f} (Δ{diff:.2f})")


def test_pk_clamped():
    """Pk should always be between 0.02 and 0.95."""
    weapon = make_weapon(base_pk=0.95)
    rng = random.Random(42)

    # Even with everything perfect
    result = calculate_missile_pk(
        weapon=weapon, launch_range_km=20.0,
        target_ecm_rating=0, target_max_g=2.0,
        target_twr_ratio=0.5, player_modifier=1.5, rng=rng,
    )
    assert result.final_pk <= 0.95, f"Pk should be clamped to 0.95, got {result.final_pk}"

    # Even with everything terrible
    result2 = calculate_missile_pk(
        weapon=weapon, launch_range_km=200.0,
        target_ecm_rating=100, target_max_g=12.0,
        target_twr_ratio=1.5, player_modifier=0.3, rng=rng,
    )
    assert result2.final_pk >= 0.02, f"Pk should be clamped to 0.02, got {result2.final_pk}"
    print(f"✓ Clamping: best case {result.final_pk:.2f}, worst case {result2.final_pk:.2f}")


if __name__ == "__main__":
    test_pk_at_rne_is_high()
    test_pk_at_rmax_is_low()
    test_high_ecm_reduces_pk()
    test_player_modifier_affects_pk()
    test_pk_clamped()
    print("\nAll missile tests passed!")
