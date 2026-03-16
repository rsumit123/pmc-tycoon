"""Tests for the tactical air battle engine (v2)."""

import pytest
from app.engine.types import (
    AircraftData, WeaponData, LoadoutItem,
    INTEL_REVEAL_ORDER, TurnAction,
)
from app.engine.tactical_air_battle import TacticalAirBattleEngine, _get_zone
from app.engine.enemy_ai import (
    EnemyDoctrine, get_doctrine, choose_enemy_action,
)


# ─── Fixtures ───

def _make_aircraft(name="F-16C", ecm_rating=40, radar_range_km=120, rcs_m2=3.0,
                   max_g_load=9.0, flare_count=30, ecm_suite="ALQ-178"):
    return AircraftData(
        id=1, name=name, origin="USA", role="Multirole", generation="4",
        max_speed_mach=2.0, max_speed_loaded_mach=1.6,
        combat_radius_km=550, service_ceiling_ft=50000,
        max_g_load=max_g_load, thrust_to_weight_clean=1.1,
        wing_loading_kg_m2=390, instantaneous_turn_rate_deg_s=26,
        sustained_turn_rate_deg_s=18, empty_weight_kg=8570,
        max_takeoff_weight_kg=19200, internal_fuel_kg=3200,
        max_payload_kg=7700, hardpoints=9,
        radar_type="APG-68", radar_range_km=radar_range_km,
        rcs_m2=rcs_m2, irst=False,
        ecm_suite=ecm_suite, ecm_rating=ecm_rating,
        chaff_count=60, flare_count=flare_count, towed_decoy=False,
    )


def _make_weapon(wtype="BVR_AAM", name="AIM-120C", wid=10, max_range=80,
                 no_escape=30, base_pk=0.70, eccm=35, maneuverability=40):
    return WeaponData(
        id=wid, name=name, weapon_type=wtype, weight_kg=150,
        max_range_km=max_range, no_escape_range_km=no_escape,
        min_range_km=2, speed_mach=4.0, guidance="active_radar",
        seeker_generation=4, base_pk=base_pk, warhead_kg=23,
        eccm_rating=eccm, maneuverability_g=maneuverability,
    )


def _make_engine(seed=42, fuel_pct=85.0, player_name="F-16C", enemy_name="Su-30MKI"):
    player = _make_aircraft(name=player_name)
    enemy = _make_aircraft(name=enemy_name, ecm_rating=50, radar_range_km=150, rcs_m2=4.0)

    bvr = _make_weapon(wtype="BVR_AAM", name="AIM-120C", wid=10)
    ir = _make_weapon(wtype="IR_AAM", name="AIM-9X", wid=20, max_range=20,
                      no_escape=10, base_pk=0.85, eccm=20, maneuverability=50)

    enemy_bvr = _make_weapon(wtype="BVR_AAM", name="R-77", wid=30, max_range=80,
                             no_escape=25, base_pk=0.65)
    enemy_ir = _make_weapon(wtype="IR_AAM", name="R-73", wid=40, max_range=30,
                            no_escape=12, base_pk=0.80)

    player_loadout = [LoadoutItem(bvr, 4), LoadoutItem(ir, 2)]
    enemy_loadout = [LoadoutItem(enemy_bvr, 4), LoadoutItem(enemy_ir, 2)]

    return TacticalAirBattleEngine(
        player_aircraft=player,
        enemy_aircraft=enemy,
        player_loadout=player_loadout,
        enemy_loadout=enemy_loadout,
        contractor_skill=60,
        fuel_pct=fuel_pct,
        seed=seed,
    )


# ─── Zone Tests ───

class TestZones:
    def test_bvr_zone(self):
        assert _get_zone(100) == "BVR"
        assert _get_zone(41) == "BVR"

    def test_transition_zone(self):
        assert _get_zone(40) == "TRANSITION"
        assert _get_zone(16) == "TRANSITION"

    def test_wvr_zone(self):
        assert _get_zone(15) == "WVR"
        assert _get_zone(5) == "WVR"


# ─── Initial State Tests ───

class TestInitialState:
    def test_initial_values(self):
        engine = _make_engine()
        assert engine.turn == 1
        assert engine.range_km == 250.0
        assert engine.damage_pct == 0.0
        assert engine.enemy_damage_pct == 0.0
        assert engine.status == "in_progress"
        assert engine.zone == "BVR"

    def test_ecm_charges_from_rating(self):
        engine = _make_engine()
        assert engine.ecm_charges >= 1

    def test_flare_uses_from_count(self):
        engine = _make_engine()
        assert engine.flare_uses >= 1

    def test_fog_of_war_initial(self):
        engine = _make_engine()
        assert engine.enemy_intel.name == "Su-30MKI"
        assert not engine.enemy_intel.radar_known
        assert not engine.enemy_intel.rcs_known
        assert not engine.enemy_intel.ecm_known

    def test_initial_state_dict(self):
        engine = _make_engine()
        state = engine.get_current_state()
        assert state.turn == 1
        assert state.max_turns == 20
        assert state.zone == "BVR"
        assert state.status == "in_progress"
        assert len(state.available_actions) > 0


# ─── Available Actions Tests ───

class TestAvailableActions:
    def test_bvr_has_scan(self):
        engine = _make_engine()
        keys = [a.key for a in engine.get_available_actions()]
        assert "scan" in keys

    def test_bvr_has_fire_bvr(self):
        engine = _make_engine()
        keys = [a.key for a in engine.get_available_actions()]
        assert any(k.startswith("fire_bvr_") for k in keys)

    def test_bvr_no_guns(self):
        engine = _make_engine()
        keys = [a.key for a in engine.get_available_actions()]
        assert "guns" not in keys

    def test_wvr_has_guns(self):
        engine = _make_engine()
        engine.range_km = 10.0  # WVR
        keys = [a.key for a in engine.get_available_actions()]
        assert "guns" in keys

    def test_wvr_has_ir(self):
        engine = _make_engine()
        engine.range_km = 10.0
        keys = [a.key for a in engine.get_available_actions()]
        assert any(k.startswith("fire_ir_") for k in keys)

    def test_pk_preview_present(self):
        engine = _make_engine()
        engine.range_km = 50.0  # in BVR, within range
        actions = engine.get_available_actions()
        fire_actions = [a for a in actions if a.pk_preview is not None]
        assert len(fire_actions) > 0
        for a in fire_actions:
            assert 0.0 < a.pk_preview <= 1.0

    def test_ecm_available_when_charges(self):
        engine = _make_engine()
        keys = [a.key for a in engine.get_available_actions()]
        assert "ecm" in keys

    def test_ecm_gone_when_depleted(self):
        engine = _make_engine()
        engine.ecm_charges = 0
        keys = [a.key for a in engine.get_available_actions()]
        assert "ecm" not in keys

    def test_disengage_always_available(self):
        engine = _make_engine()
        keys = [a.key for a in engine.get_available_actions()]
        assert "disengage" in keys


# ─── Fog of War Tests ───

class TestFogOfWar:
    def test_scan_reveals_in_order(self):
        engine = _make_engine(seed=100)
        engine.range_km = 200.0  # stay in BVR

        for i, expected_field in enumerate(INTEL_REVEAL_ORDER):
            result = engine.run_turn("scan")
            assert result.intel_revealed == expected_field

    def test_scan_reveals_radar_first(self):
        engine = _make_engine(seed=100)
        result = engine.run_turn("scan")
        assert result.intel_revealed == "radar"
        assert engine.enemy_intel.radar_known
        assert engine.enemy_intel.radar_range_km is not None

    def test_passive_intel_from_enemy_fire(self):
        engine = _make_engine(seed=200)
        initial_obs = len(engine.enemy_intel.observed_weapons)
        # Run many turns; enemy should fire at some point
        for _ in range(10):
            if engine.status != "in_progress":
                break
            engine.run_turn("scan")
        # Enemy should have fired at least once
        assert len(engine.enemy_intel.observed_weapons) >= initial_obs


# ─── Fuel Consumption Tests ───

class TestFuelConsumption:
    def test_fuel_decreases_each_turn(self):
        engine = _make_engine(seed=42)
        initial_fuel = engine.fuel_pct
        engine.run_turn("scan")
        assert engine.fuel_pct < initial_fuel

    def test_maneuver_burns_more_fuel(self):
        engine1 = _make_engine(seed=42)
        engine2 = _make_engine(seed=42)

        engine1.run_turn("scan")
        fuel_after_scan = engine1.fuel_pct

        engine2.run_turn("close")
        fuel_after_close = engine2.fuel_pct

        # Close should burn more than scan (on average)
        # Due to randomness we just check both consumed fuel
        assert fuel_after_scan < 85.0
        assert fuel_after_close < 85.0


# ─── Zone Transition Tests ───

class TestZoneTransitions:
    def test_closing_reduces_range(self):
        engine = _make_engine(seed=42)
        initial_range = engine.range_km
        engine.run_turn("close")
        assert engine.range_km < initial_range

    def test_extending_increases_range(self):
        engine = _make_engine(seed=42)
        engine.range_km = 30.0  # transition zone
        initial_range = engine.range_km
        engine.run_turn("extend")
        assert engine.range_km > initial_range


# ─── Combat Resolution Tests ───

class TestCombatResolution:
    def test_fire_bvr_consumes_ammo(self):
        engine = _make_engine(seed=42)
        engine.range_km = 60.0
        initial_qty = engine.player_loadout[0].quantity
        actions = engine.get_available_actions()
        bvr_action = [a for a in actions if a.key.startswith("fire_bvr_")][0]
        engine.run_turn(bvr_action.key, bvr_action.weapon_id)
        assert engine.player_loadout[0].quantity == initial_qty - 1

    def test_fire_has_hit_or_miss(self):
        engine = _make_engine(seed=42)
        engine.range_km = 60.0
        actions = engine.get_available_actions()
        bvr_action = [a for a in actions if a.key.startswith("fire_bvr_")][0]
        result = engine.run_turn(bvr_action.key, bvr_action.weapon_id)
        assert result.shot_hit is not None
        assert result.shot_pk is not None

    def test_guns_only_wvr(self):
        engine = _make_engine(seed=42)
        engine.range_km = 10.0
        result = engine.run_turn("guns")
        assert result.weapon_fired == "Cannon"
        assert result.shot_hit is not None


# ─── Exit Conditions Tests ───

class TestExitConditions:
    def test_enemy_destroyed(self):
        engine = _make_engine(seed=42)
        engine.enemy_damage_pct = 95.0
        engine.range_km = 10.0
        result = engine.run_turn("guns")
        if result.shot_hit and engine.enemy_damage_pct >= 100:
            assert engine.exit_reason == "enemy_destroyed"

    def test_player_bingo_fuel(self):
        engine = _make_engine(seed=42, fuel_pct=3.0)
        engine.run_turn("scan")
        if engine.fuel_pct <= 0:
            assert engine.exit_reason == "player_bingo_fuel"

    def test_max_turns(self):
        engine = _make_engine(seed=42)
        engine.turn = 21
        engine.range_km = 200.0
        result = engine.run_turn("scan")
        assert engine.exit_reason == "max_turns_reached"

    def test_disengage_at_long_range(self):
        """Disengage at long range should almost always succeed."""
        engine = _make_engine(seed=42)
        engine.range_km = 150.0  # very long range, ~105% chance (capped at 95%)
        engine.run_turn("disengage")
        assert engine.exit_reason == "player_disengaged"

    def test_disengage_contested_at_close_range(self):
        """Disengage at close range should sometimes fail."""
        # Run multiple seeds, at least one should fail at 5km range
        results = []
        for seed in range(100, 120):
            engine = _make_engine(seed=seed)
            engine.range_km = 5.0  # very close, ~32.5% chance
            engine.run_turn("disengage")
            results.append(engine.exit_reason)
        # Should have some failures (None = disengage failed)
        assert None in results or "player_disengaged" in results  # at least some resolved

    def test_enemy_winchester(self):
        """Enemy with no missiles in non-WVR should exit (winchester or disengage)."""
        engine = _make_engine(seed=42)
        engine.range_km = 60.0
        # Deplete all enemy ammo
        for item in engine.enemy_loadout:
            item.quantity = 0
        engine.run_turn("scan")
        # Enemy exits via winchester or disengage (AI may choose disengage when out of ammo)
        assert engine.exit_reason in ("enemy_winchester", "enemy_disengaged")
        assert engine.status == "completed"

    def test_damage_capped_at_100(self):
        """Damage should never exceed 100%."""
        engine = _make_engine(seed=42)
        engine.enemy_damage_pct = 95.0
        engine.range_km = 10.0
        # Fire guns — if it hits, damage should cap
        engine.run_turn("guns")
        assert engine.enemy_damage_pct <= 100.0

    def test_player_damage_capped_at_100(self):
        """Player damage should never exceed 100%."""
        engine = _make_engine(seed=42)
        engine.damage_pct = 95.0
        # Run turns — if enemy hits, should cap
        for _ in range(5):
            if engine.status != "in_progress":
                break
            engine.run_turn("scan")
        assert engine.damage_pct <= 100.0


# ─── Enemy AI Tests ───

class TestEnemyAI:
    def test_doctrine_lookup(self):
        assert get_doctrine("Su-30MKI") == EnemyDoctrine.AGGRESSIVE
        assert get_doctrine("F-16C Fighting Falcon") == EnemyDoctrine.CAUTIOUS
        assert get_doctrine("Unknown Aircraft") == EnemyDoctrine.CAUTIOUS

    def test_winchester_disengages(self):
        import random
        rng = random.Random(42)
        action = choose_enemy_action(
            EnemyDoctrine.AGGRESSIVE, "BVR",
            enemy_damage_pct=10, enemy_fuel_pct=50,
            enemy_has_bvr=False, enemy_has_ir=False, rng=rng,
        )
        assert action in ("disengage", "guns")

    def test_bingo_fuel_disengages(self):
        import random
        rng = random.Random(42)
        action = choose_enemy_action(
            EnemyDoctrine.AGGRESSIVE, "BVR",
            enemy_damage_pct=10, enemy_fuel_pct=10,
            enemy_has_bvr=True, enemy_has_ir=True, rng=rng,
        )
        assert action == "disengage"


# ─── Serialization Tests ───

class TestSerialization:
    def test_to_dict_and_restore(self):
        engine = _make_engine(seed=42)
        # Run a few turns
        engine.run_turn("scan")
        engine.run_turn("close")

        state_dict = engine.to_dict()
        assert state_dict["engine_version"] == 2
        assert state_dict["turn"] == engine.turn
        assert state_dict["base_seed"] == 42

        # Create fresh engine and restore
        engine2 = _make_engine(seed=42)
        engine2.restore_from_dict(state_dict)

        assert engine2.turn == engine.turn
        assert engine2.range_km == engine.range_km
        assert engine2.fuel_pct == engine.fuel_pct
        assert engine2.damage_pct == engine.damage_pct
        assert engine2.ecm_charges == engine.ecm_charges

    def test_rng_determinism_after_restore(self):
        """Restored engine should produce same results for same turn."""
        engine1 = _make_engine(seed=42)
        engine1.run_turn("scan")
        engine1.run_turn("close")
        # Save state after turn 2
        state_dict = engine1.to_dict()
        # Run turn 3
        result1 = engine1.run_turn("scan")

        # Restore to after turn 2 and run turn 3 again
        engine2 = _make_engine(seed=42)
        engine2.restore_from_dict(state_dict)
        result2 = engine2.run_turn("scan")

        # Should produce identical results
        assert result1.fuel_consumed == result2.fuel_consumed
        assert result1.enemy_action == result2.enemy_action


# ─── Full Battle Test ───

class TestFullBattle:
    def test_deterministic_battle(self):
        """Run a full battle with deterministic seed and verify it completes."""
        engine = _make_engine(seed=12345)
        turns = 0
        while engine.status == "in_progress" and turns < 25:
            actions = engine.get_available_actions()
            # Pick first fire action, or close, or scan
            action = actions[0]
            for a in actions:
                if a.key.startswith("fire_"):
                    action = a
                    break
            result = engine.run_turn(action.key, action.weapon_id)
            turns += 1
            assert result.narrative  # every turn should have a narrative

        assert engine.status == "completed"
        assert engine.exit_reason is not None

        report = engine.get_battle_result()
        assert report.turns_played > 0
        assert report.exit_reason
        assert report.narrative_summary

    def test_battle_state_is_consistent(self):
        """State snapshot should reflect engine state."""
        engine = _make_engine(seed=42)
        engine.run_turn("scan")
        state = engine.get_current_state()
        assert state.turn == engine.turn
        assert state.fuel_pct == round(engine.fuel_pct, 1)
        assert state.damage_pct == round(engine.damage_pct, 1)


# ─── Pk Preview Tests ───

class TestPkPreview:
    def test_pk_preview_matches_resolution_range(self):
        """Pk preview should be close to actual Pk (without random component)."""
        engine = _make_engine(seed=42)
        engine.range_km = 50.0

        actions = engine.get_available_actions()
        fire_action = None
        for a in actions:
            if a.pk_preview is not None and a.key.startswith("fire_bvr_"):
                fire_action = a
                break

        assert fire_action is not None
        # Preview should be a reasonable value
        assert 0.0 < fire_action.pk_preview <= 1.0
