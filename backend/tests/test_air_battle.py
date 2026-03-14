"""Tests for the full air battle engine — 6-phase simulation."""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.engine.air_battle import AirBattleEngine
from app.engine.types import AircraftData, WeaponData, LoadoutItem


def make_rafale() -> AircraftData:
    return AircraftData(
        id=1, name="Dassault Rafale", origin="France", role="multirole", generation="4.5",
        max_speed_mach=1.8, max_speed_loaded_mach=1.4, combat_radius_km=1850,
        service_ceiling_ft=50000, max_g_load=9.0, thrust_to_weight_clean=1.13,
        wing_loading_kg_m2=306, instantaneous_turn_rate_deg_s=28,
        sustained_turn_rate_deg_s=22, empty_weight_kg=10300,
        max_takeoff_weight_kg=24500, internal_fuel_kg=4700,
        max_payload_kg=9500, hardpoints=14, radar_type="RBE2 AESA",
        radar_range_km=200, rcs_m2=1.0, irst=True, ecm_suite="SPECTRA",
        ecm_rating=85, chaff_count=112, flare_count=32, towed_decoy=True,
    )


def make_f16() -> AircraftData:
    return AircraftData(
        id=2, name="F-16C Block 52", origin="USA", role="multirole", generation="4",
        max_speed_mach=2.0, max_speed_loaded_mach=1.5, combat_radius_km=1370,
        service_ceiling_ft=50000, max_g_load=9.0, thrust_to_weight_clean=1.095,
        wing_loading_kg_m2=431, instantaneous_turn_rate_deg_s=26,
        sustained_turn_rate_deg_s=20, empty_weight_kg=8570,
        max_takeoff_weight_kg=19200, internal_fuel_kg=3160,
        max_payload_kg=7700, hardpoints=11, radar_type="APG-68(V)9",
        radar_range_km=160, rcs_m2=5.0, irst=False, ecm_suite="ALQ-211",
        ecm_rating=65, chaff_count=90, flare_count=30, towed_decoy=False,
    )


def make_mica_em() -> WeaponData:
    return WeaponData(
        id=4, name="MICA EM", weapon_type="BVR_AAM", weight_kg=112,
        max_range_km=80, no_escape_range_km=30, min_range_km=3,
        speed_mach=4.0, guidance="inertial+active_radar", seeker_generation=4,
        base_pk=0.85, warhead_kg=12, eccm_rating=82, maneuverability_g=50,
    )


def make_mica_ir() -> WeaponData:
    return WeaponData(
        id=9, name="MICA IR", weapon_type="IR_AAM", weight_kg=112,
        max_range_km=20, no_escape_range_km=10, min_range_km=1,
        speed_mach=4.0, guidance="imaging_IR", seeker_generation=4,
        base_pk=0.85, warhead_kg=12, eccm_rating=78, maneuverability_g=50,
    )


def make_aim120() -> WeaponData:
    return WeaponData(
        id=3, name="AIM-120C AMRAAM", weapon_type="BVR_AAM", weight_kg=152,
        max_range_km=120, no_escape_range_km=45, min_range_km=4,
        speed_mach=4.0, guidance="inertial+active_radar", seeker_generation=4,
        base_pk=0.80, warhead_kg=18, eccm_rating=80, maneuverability_g=40,
    )


def make_aim9x() -> WeaponData:
    return WeaponData(
        id=8, name="AIM-9X Sidewinder", weapon_type="IR_AAM", weight_kg=85,
        max_range_km=18, no_escape_range_km=8, min_range_km=1,
        speed_mach=3.0, guidance="imaging_IR", seeker_generation=5,
        base_pk=0.88, warhead_kg=9, eccm_rating=80, maneuverability_g=55,
    )


def test_full_battle_rafale_vs_f16():
    """Run a complete 6-phase battle with deterministic seed."""
    rafale = make_rafale()
    f16 = make_f16()

    player_loadout = [
        LoadoutItem(make_mica_em(), 4),
        LoadoutItem(make_mica_ir(), 2),
    ]
    enemy_loadout = [
        LoadoutItem(make_aim120(), 4),
        LoadoutItem(make_aim9x(), 2),
    ]

    engine = AirBattleEngine(
        player_aircraft=rafale,
        enemy_aircraft=f16,
        player_loadout=player_loadout,
        enemy_loadout=enemy_loadout,
        contractor_skill=80,
        seed=42,
    )

    # Phase 2: Detection
    state = engine.get_current_state()
    assert state.phase == 2
    assert state.player_name == "Dassault Rafale"
    assert len(state.available_choices) == 3

    result = engine.run_phase("aggressive_scan")
    assert result.phase_number == 2
    assert result.phase_name == "Detection"
    assert result.outcome["first_detect"] in ("player", "enemy")
    print(f"Phase 2: {result.outcome['first_detect']} detects first. {result.narrative[:80]}...")

    # Phase 3: BVR
    result = engine.run_phase("close_to_rne")
    assert result.phase_number == 3
    assert result.phase_name == "BVR Engagement"
    if result.outcome.get("player_shot"):
        shot = result.outcome["player_shot"]
        print(f"Phase 3: Fired {shot['weapon']} at {shot['launch_range']:.0f}km — Pk {shot['pk']:.0%} — {'HIT' if shot['hit'] else 'MISS'}")
    else:
        print(f"Phase 3: {result.narrative[:80]}...")

    # Phase 4: Countermeasures
    result = engine.run_phase("notch_beam")
    assert result.phase_number == 4
    print(f"Phase 4: {result.narrative[:80]}...")

    # Phase 5: WVR
    result = engine.run_phase("ir_missile")
    assert result.phase_number == 5
    print(f"Phase 5: {result.narrative[:80]}...")

    # Phase 6: Damage & Disengage
    result = engine.run_phase("rtb")
    assert result.phase_number == 6
    print(f"Phase 6: {result.narrative[:80]}...")

    # Get final report
    report = engine.get_battle_result()
    assert len(report.phases) == 5  # phases 2-6
    assert report.payout > 0
    print(f"\n{'SUCCESS' if report.success else 'FAILURE'}: {report.narrative_summary}")
    print(f"Payout: ${report.payout:,}, Reputation: {report.reputation_change:+d}")
    print(f"Damage dealt: {report.total_damage_dealt:.0f}%, taken: {report.total_damage_taken:.0f}%")


def test_state_tracks_ammo():
    """Verify ammo is consumed after firing."""
    engine = AirBattleEngine(
        player_aircraft=make_rafale(),
        enemy_aircraft=make_f16(),
        player_loadout=[LoadoutItem(make_mica_em(), 4), LoadoutItem(make_mica_ir(), 2)],
        enemy_loadout=[LoadoutItem(make_aim120(), 4)],
        seed=42,
    )

    state_before = engine.get_current_state()
    bvr_ammo_before = next(a["remaining"] for a in state_before.player_ammo if a["type"] == "BVR_AAM")

    engine.run_phase("aggressive_scan")  # phase 2
    engine.run_phase("fire_at_rmax")  # phase 3 — fires a MICA EM

    state_after = engine.get_current_state()
    bvr_ammo_after = next(a["remaining"] for a in state_after.player_ammo if a["type"] == "BVR_AAM")

    assert bvr_ammo_after < bvr_ammo_before, f"Ammo should decrease after firing: {bvr_ammo_before} -> {bvr_ammo_after}"
    print(f"✓ Ammo tracking: BVR missiles {bvr_ammo_before} -> {bvr_ammo_after}")


def test_fuel_decreases():
    """Fuel should decrease each phase."""
    engine = AirBattleEngine(
        player_aircraft=make_rafale(),
        enemy_aircraft=make_f16(),
        player_loadout=[LoadoutItem(make_mica_em(), 4)],
        enemy_loadout=[LoadoutItem(make_aim120(), 4)],
        seed=42,
    )

    fuel_before = engine.player_fuel_pct
    engine.run_phase("aggressive_scan")
    fuel_after = engine.player_fuel_pct

    assert fuel_after < fuel_before, f"Fuel should decrease: {fuel_before} -> {fuel_after}"
    print(f"✓ Fuel consumption: {fuel_before:.0f}% -> {fuel_after:.0f}%")


if __name__ == "__main__":
    test_full_battle_rafale_vs_f16()
    print()
    test_state_tracks_ammo()
    test_fuel_decreases()
    print("\nAll air battle tests passed!")
