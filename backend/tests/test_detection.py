"""Tests for the detection phase calculations."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.engine.detection import calculate_air_detection
from app.engine.types import AircraftData


def make_aircraft(**kwargs) -> AircraftData:
    defaults = dict(
        id=1, name="Test", origin="Test", role="multirole", generation="4",
        max_speed_mach=1.8, max_speed_loaded_mach=1.4, combat_radius_km=1500,
        service_ceiling_ft=50000, max_g_load=9.0, thrust_to_weight_clean=1.1,
        wing_loading_kg_m2=300, instantaneous_turn_rate_deg_s=25,
        sustained_turn_rate_deg_s=20, empty_weight_kg=10000,
        max_takeoff_weight_kg=24000, internal_fuel_kg=4500,
        max_payload_kg=9000, hardpoints=12, radar_type="AESA",
        radar_range_km=200, rcs_m2=1.0, irst=True, ecm_suite="ECM",
        ecm_rating=70, chaff_count=100, flare_count=30, towed_decoy=True,
    )
    defaults.update(kwargs)
    return AircraftData(**defaults)


def test_rafale_vs_f16_detection():
    """Rafale (low RCS, good radar) should detect F-16 (high RCS) first."""
    rafale = make_aircraft(name="Rafale", radar_range_km=200, rcs_m2=1.0, ecm_rating=85, irst=True)
    f16 = make_aircraft(name="F-16", radar_range_km=160, rcs_m2=5.0, ecm_rating=65, irst=False)

    result = calculate_air_detection(rafale, f16, "aggressive_scan")

    assert result.first_detect == "player", f"Rafale should detect first, got {result.first_detect}"
    assert result.player_detection_range_km > result.enemy_detection_range_km
    assert result.advantage_km > 30  # significant advantage
    print(f"✓ Rafale detects F-16 at {result.player_detection_range_km}km, F-16 detects Rafale at {result.enemy_detection_range_km}km (advantage: {result.advantage_km}km)")


def test_low_rcs_advantage():
    """A stealthy aircraft should be harder to detect."""
    stealth = make_aircraft(name="Stealth", rcs_m2=0.5, radar_range_km=200)
    normal = make_aircraft(name="Normal", rcs_m2=10.0, radar_range_km=200)

    result = calculate_air_detection(stealth, normal, "aggressive_scan")

    # Stealth sees normal far away (high RCS), normal struggles to see stealth (low RCS)
    assert result.first_detect == "player"
    assert result.advantage_km > 50
    print(f"✓ Stealth advantage: {result.advantage_km}km edge")


def test_passive_irst_reduces_enemy_detection():
    """Using passive IRST should reduce enemy's ability to detect you."""
    player = make_aircraft(name="Player", radar_range_km=200, rcs_m2=1.0, irst=True)
    enemy = make_aircraft(name="Enemy", radar_range_km=200, rcs_m2=5.0)

    result_active = calculate_air_detection(player, enemy, "aggressive_scan")
    result_passive = calculate_air_detection(player, enemy, "passive_irst")

    # Passive mode: player detects at shorter range, but enemy also detects at shorter range
    assert result_passive.player_detection_range_km < result_active.player_detection_range_km
    assert result_passive.enemy_detection_range_km < result_active.enemy_detection_range_km
    print(f"✓ IRST: player range {result_passive.player_detection_range_km}km (was {result_active.player_detection_range_km}km), enemy range {result_passive.enemy_detection_range_km}km (was {result_active.enemy_detection_range_km}km)")


def test_ecm_degrades_enemy_detection():
    """Early ECM should reduce enemy detection range."""
    player = make_aircraft(name="Player", ecm_rating=85, rcs_m2=1.0, radar_range_km=200)
    enemy = make_aircraft(name="Enemy", radar_range_km=200, rcs_m2=5.0)

    result_normal = calculate_air_detection(player, enemy, "aggressive_scan")
    result_ecm = calculate_air_detection(player, enemy, "early_ecm")

    assert result_ecm.enemy_detection_range_km < result_normal.enemy_detection_range_km
    print(f"✓ ECM reduces enemy detection from {result_normal.enemy_detection_range_km}km to {result_ecm.enemy_detection_range_km}km")


if __name__ == "__main__":
    test_rafale_vs_f16_detection()
    test_low_rcs_advantage()
    test_passive_irst_reduces_enemy_detection()
    test_ecm_degrades_enemy_detection()
    print("\nAll detection tests passed!")
