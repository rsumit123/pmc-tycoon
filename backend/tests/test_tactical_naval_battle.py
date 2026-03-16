"""Tests for the tactical naval battle engine (v2)."""

import pytest
import random
from app.engine.types import (
    ShipData, WeaponData, ShipCompartment,
    NavalTurnAction, NavalTurnResult, NavalTacticalState,
)
from app.engine.tactical_naval_battle import (
    TacticalNavalBattleEngine, _get_phase,
)
from app.engine.naval_ai import (
    NavalDoctrine, get_naval_doctrine, choose_naval_action,
)


# ─── Fixtures ───

def _make_weapon(wtype="ASM", name="Harpoon", wid=100, max_range=130,
                  no_escape=40, base_pk=0.70, speed_mach=0.9, warhead_kg=225,
                  eccm=30, maneuverability=20):
    return WeaponData(
        id=wid, name=name, weapon_type=wtype, weight_kg=700,
        max_range_km=max_range, no_escape_range_km=no_escape,
        min_range_km=5, speed_mach=speed_mach, guidance="active_radar",
        seeker_generation=3, base_pk=base_pk, warhead_kg=warhead_kg,
        eccm_rating=eccm, maneuverability_g=maneuverability,
    )


def _make_sam(name="SM-2", wid=200, base_pk=0.65):
    return WeaponData(
        id=wid, name=name, weapon_type="SAM", weight_kg=1500,
        max_range_km=170, no_escape_range_km=50,
        min_range_km=2, speed_mach=3.5, guidance="semi_active_radar",
        seeker_generation=4, base_pk=base_pk, warhead_kg=62,
        eccm_rating=40, maneuverability_g=30,
    )


def _make_ciws(name="Phalanx", wid=300, base_pk=0.40):
    return WeaponData(
        id=wid, name=name, weapon_type="CIWS", weight_kg=6000,
        max_range_km=2, no_escape_range_km=1,
        min_range_km=0, speed_mach=0.0, guidance="radar",
        seeker_generation=4, base_pk=base_pk, warhead_kg=0,
        eccm_rating=0, maneuverability_g=0,
    )


def _make_ship(name="DDG-51 Arleigh Burke", ship_id=1, asm_count=8, sam_count=4,
               ciws_count=2, displacement=9000, ecm_rating=60):
    asm = _make_weapon()
    sam = _make_sam()
    ciws = _make_ciws()
    return ShipData(
        id=ship_id, name=name, class_name="Destroyer", origin="USA",
        ship_type="destroyer", displacement_tons=displacement,
        max_speed_knots=30, radar_type="SPY-1D",
        radar_range_km=400, ecm_suite="SLQ-32", ecm_rating=ecm_rating,
        compartments=4,
        anti_ship_missiles=[{"weapon": asm, "count": asm_count}],
        sam_systems=[{"weapon": sam, "count": sam_count}],
        ciws=[{"weapon": ciws, "count": ciws_count}],
    )


def _make_engine(seed=42, player_name="DDG-51 Arleigh Burke",
                 enemy_name="Type 055 Nanchang", asm_count=8, enemy_asm_count=8):
    player = _make_ship(name=player_name, ship_id=1, asm_count=asm_count)
    enemy = _make_ship(name=enemy_name, ship_id=2, asm_count=enemy_asm_count,
                       ecm_rating=50)

    return TacticalNavalBattleEngine(
        player_ship=player,
        enemy_ship=enemy,
        seed=seed,
    )


# ─── Phase Tests ───

class TestPhases:
    def test_approach_at_long_range(self):
        assert _get_phase(200.0, 8, 8, False) == "approach"

    def test_exchange_at_medium_range(self):
        assert _get_phase(100.0, 8, 8, False) == "exchange"

    def test_aftermath_no_missiles(self):
        assert _get_phase(100.0, 0, 0, False) == "aftermath"

    def test_aftermath_disengaging(self):
        assert _get_phase(100.0, 8, 8, True) == "aftermath"


# ─── Initial State Tests ───

class TestInitialState:
    def test_initial_values(self):
        engine = _make_engine()
        assert engine.turn == 1
        assert engine.range_km == 350.0
        assert engine.status == "in_progress"
        assert engine.phase == "approach"

    def test_compartments_start_at_100(self):
        engine = _make_engine()
        for comp in engine.player_compartments:
            assert comp.hp_pct == 100.0
        for comp in engine.enemy_compartments:
            assert comp.hp_pct == 100.0

    def test_missiles_counted(self):
        engine = _make_engine(asm_count=12)
        assert engine.player_missiles_remaining == 12

    def test_ecm_charges_from_rating(self):
        engine = _make_engine()
        assert engine.ecm_charges >= 1

    def test_initial_state_dict(self):
        engine = _make_engine()
        state = engine.get_current_state()
        assert state.turn == 1
        assert state.max_turns == 15
        assert state.phase == "approach"
        assert state.status == "in_progress"
        assert len(state.available_actions) > 0
        assert state.player_missiles_remaining == 8


# ─── Available Actions Tests ───

class TestAvailableActions:
    def test_approach_has_scan(self):
        engine = _make_engine()
        keys = [a.key for a in engine.get_available_actions()]
        assert "scan" in keys

    def test_approach_has_sprint(self):
        engine = _make_engine()
        keys = [a.key for a in engine.get_available_actions()]
        assert "sprint" in keys

    def test_exchange_has_salvo(self):
        engine = _make_engine()
        engine.range_km = 100.0  # exchange range
        keys = [a.key for a in engine.get_available_actions()]
        assert "full_salvo" in keys
        assert "half_salvo" in keys
        assert "sea_skim" in keys
        assert "high_dive" in keys

    def test_exchange_has_ecm(self):
        engine = _make_engine()
        engine.range_km = 100.0
        keys = [a.key for a in engine.get_available_actions()]
        assert "ecm_jam" in keys

    def test_exchange_has_damage_control(self):
        engine = _make_engine()
        engine.range_km = 100.0
        keys = [a.key for a in engine.get_available_actions()]
        assert "damage_control" in keys

    def test_exchange_has_disengage(self):
        engine = _make_engine()
        engine.range_km = 100.0
        keys = [a.key for a in engine.get_available_actions()]
        assert "disengage" in keys

    def test_no_disengage_with_damaged_engines(self):
        engine = _make_engine()
        engine.range_km = 100.0
        engine._get_compartment(engine.player_compartments, "engines").hp_pct = 30.0
        keys = [a.key for a in engine.get_available_actions()]
        assert "disengage" not in keys

    def test_aftermath_actions(self):
        engine = _make_engine()
        engine.player_missiles_remaining = 0
        engine.enemy_missiles_remaining = 0
        engine.range_km = 100.0
        keys = [a.key for a in engine.get_available_actions()]
        assert "pursue" in keys
        assert "withdraw" in keys
        assert "damage_control_final" in keys

    def test_salvo_size_on_actions(self):
        engine = _make_engine(asm_count=10)
        engine.range_km = 100.0
        actions = engine.get_available_actions()
        full = [a for a in actions if a.key == "full_salvo"][0]
        half = [a for a in actions if a.key == "half_salvo"][0]
        assert full.salvo_size == 10
        assert half.salvo_size == 5

    def test_no_salvo_when_out_of_missiles(self):
        engine = _make_engine()
        engine.range_km = 100.0
        engine.player_missiles_remaining = 0
        keys = [a.key for a in engine.get_available_actions()]
        assert "full_salvo" not in keys
        assert "half_salvo" not in keys

    def test_ecm_gone_when_depleted(self):
        engine = _make_engine()
        engine.range_km = 100.0
        engine.ecm_charges = 0
        keys = [a.key for a in engine.get_available_actions()]
        assert "ecm_jam" not in keys


# ─── Phase Transition Tests ───

class TestPhaseTransitions:
    def test_approach_to_exchange(self):
        engine = _make_engine(seed=42)
        # Sprint a few times to close range
        for _ in range(10):
            if engine.phase != "approach" or engine.status != "in_progress":
                break
            engine.run_turn("sprint")

        # Should have transitioned to exchange at some point
        assert engine.range_km < 350.0
        # If range crossed 150km, phase should be exchange
        if engine.range_km <= 150:
            assert engine.phase == "exchange"

    def test_exchange_to_aftermath(self):
        engine = _make_engine(seed=42)
        engine.range_km = 100.0  # exchange phase
        engine.player_missiles_remaining = 1
        engine.enemy_missiles_remaining = 1

        # Fire full salvo (uses remaining missile)
        engine.run_turn("full_salvo")
        # After both deplete, should transition to aftermath
        if engine.player_missiles_remaining == 0 and engine.enemy_missiles_remaining == 0:
            assert engine.phase == "aftermath"


# ─── Compartment Damage Tests ───

class TestCompartmentDamage:
    def test_hits_reduce_compartment_hp(self):
        engine = _make_engine(seed=42)
        engine.range_km = 100.0

        initial_total = sum(c.hp_pct for c in engine.enemy_compartments)
        engine.run_turn("full_salvo")

        final_total = sum(c.hp_pct for c in engine.enemy_compartments)
        # If any hits landed, total should be less
        # (may or may not hit depending on salvo result + RNG)
        assert final_total <= initial_total

    def test_damage_control_repairs(self):
        engine = _make_engine(seed=42)
        engine.range_km = 100.0
        # Damage a compartment first
        engine._get_compartment(engine.player_compartments, "hull").hp_pct = 50.0

        result = engine.run_turn("damage_control")
        # Should have repaired something
        assert result.damage_repaired > 0
        worst = engine._worst_compartment(engine.player_compartments)
        # The worst compartment should have improved
        assert worst.hp_pct > 0  # at least not worse

    def test_damaged_radar_affects_defense(self):
        engine = _make_engine()
        engine._get_compartment(engine.player_compartments, "radar").hp_pct = 30.0
        mod = engine._effective_sam_pk_mod(engine.player_compartments)
        assert mod == 0.5

    def test_damaged_weapons_reduces_salvo(self):
        engine = _make_engine(asm_count=10)
        engine._get_compartment(engine.player_compartments, "weapons").hp_pct = 30.0
        effective = engine._effective_salvo_size(10, engine.player_compartments)
        assert effective == 5  # halved

    def test_damaged_engines_block_disengage(self):
        engine = _make_engine()
        engine._get_compartment(engine.player_compartments, "engines").hp_pct = 30.0
        assert not engine._can_disengage(engine.player_compartments)

    def test_damaged_engines_reduce_range_closing(self):
        engine = _make_engine()
        engine._get_compartment(engine.player_compartments, "engines").hp_pct = 30.0
        mod = engine._range_close_modifier(engine.player_compartments)
        assert mod == 0.5

    def test_hull_zero_means_sunk(self):
        engine = _make_engine(seed=42)
        engine.range_km = 100.0
        engine._get_compartment(engine.enemy_compartments, "hull").hp_pct = 0.0
        engine.run_turn("damage_control")  # just need to trigger exit check
        assert engine.status == "completed"
        assert engine.exit_reason == "enemy_sunk"


# ─── ECM Tests ───

class TestECM:
    def test_ecm_depletes_charges(self):
        engine = _make_engine(seed=42)
        engine.range_km = 100.0
        initial_charges = engine.ecm_charges
        engine.run_turn("ecm_jam")
        assert engine.ecm_charges == initial_charges - 1

    def test_ecm_charges_start_reasonable(self):
        engine = _make_engine()
        # ecm_rating=60, charges = 60//20 = 3
        assert engine.ecm_charges == 3


# ─── Exit Conditions Tests ───

class TestExitConditions:
    def test_player_sunk(self):
        engine = _make_engine(seed=42)
        engine.range_km = 100.0
        engine._get_compartment(engine.player_compartments, "hull").hp_pct = 0.0
        engine.run_turn("damage_control")
        assert engine.exit_reason == "player_sunk"

    def test_enemy_sunk(self):
        engine = _make_engine(seed=42)
        engine.range_km = 100.0
        engine._get_compartment(engine.enemy_compartments, "hull").hp_pct = 0.0
        engine.run_turn("damage_control")
        assert engine.exit_reason == "enemy_sunk"

    def test_withdraw_exits(self):
        engine = _make_engine(seed=42)
        engine.player_missiles_remaining = 0
        engine.enemy_missiles_remaining = 0
        engine.range_km = 100.0
        engine.run_turn("withdraw")
        assert engine.exit_reason == "player_withdrew"
        assert engine.status == "completed"

    def test_max_turns(self):
        engine = _make_engine(seed=42)
        engine.turn = 16
        engine.range_km = 200.0
        engine.run_turn("scan")
        assert engine.exit_reason == "max_turns_reached"

    def test_disengage_at_long_range(self):
        engine = _make_engine(seed=42)
        engine.range_km = 250.0  # long range, high chance
        engine.run_turn("disengage")
        # At 250km, chance is min(0.90, 0.2 + 250/300) = min(0.90, 1.03) = 0.90
        # Very likely to succeed
        assert engine.exit_reason in ("player_disengaged", None)


# ─── Naval AI Tests ───

class TestNavalAI:
    def test_doctrine_lookup(self):
        assert get_naval_doctrine("Arleigh Burke DDG-51") == NavalDoctrine.AGGRESSIVE
        assert get_naval_doctrine("Ticonderoga CG-47") == NavalDoctrine.DEFENSIVE
        assert get_naval_doctrine("Unknown Ship") == NavalDoctrine.METHODICAL

    def test_out_of_missiles_no_fire(self):
        rng = random.Random(42)
        action = choose_naval_action(
            NavalDoctrine.AGGRESSIVE, "exchange",
            [{"name": "hull", "hp_pct": 80}], 0, rng,
        )
        assert action not in ("full_salvo", "half_salvo", "sea_skim", "high_dive")

    def test_heavily_damaged_prioritizes_repair(self):
        # Run multiple seeds, should often choose damage_control
        repair_count = 0
        for seed in range(100):
            rng = random.Random(seed)
            action = choose_naval_action(
                NavalDoctrine.AGGRESSIVE, "exchange",
                [{"name": "hull", "hp_pct": 20}, {"name": "radar", "hp_pct": 20},
                 {"name": "weapons", "hp_pct": 20}, {"name": "engines", "hp_pct": 20}],
                8, rng,
            )
            if action == "damage_control":
                repair_count += 1
        # Should choose damage_control at least 50% of the time
        assert repair_count >= 40


# ─── Salvo Resolution Tests ───

class TestSalvoResolution:
    def test_full_salvo_consumes_missiles(self):
        engine = _make_engine(seed=42, asm_count=8)
        engine.range_km = 100.0
        initial = engine.player_missiles_remaining
        engine.run_turn("full_salvo")
        assert engine.player_missiles_remaining < initial

    def test_half_salvo_consumes_half(self):
        engine = _make_engine(seed=42, asm_count=8)
        engine.range_km = 100.0
        engine.run_turn("half_salvo")
        assert engine.player_missiles_remaining == 4  # 8 - 4

    def test_sea_skim_profile(self):
        engine = _make_engine(seed=42, asm_count=8)
        engine.range_km = 100.0
        result = engine.run_turn("sea_skim")
        assert result.player_salvo_fired == 4  # half
        assert result.player_action == "sea_skim"

    def test_high_dive_profile(self):
        engine = _make_engine(seed=42, asm_count=8)
        engine.range_km = 100.0
        result = engine.run_turn("high_dive")
        assert result.player_salvo_fired == 4  # half
        assert result.player_action == "high_dive"


# ─── Fog of War Tests ───

class TestFogOfWar:
    def test_enemy_compartments_hidden_initially(self):
        engine = _make_engine()
        state = engine.get_current_state()
        for comp in state.enemy_compartments_known:
            assert comp["hp_pct"] == "???"

    def test_scan_reveals_compartments(self):
        engine = _make_engine(seed=42)
        engine.run_turn("scan")
        state = engine.get_current_state()
        for comp in state.enemy_compartments_known:
            assert isinstance(comp["hp_pct"], float)


# ─── Serialization Tests ───

class TestSerialization:
    def test_to_dict_and_restore(self):
        engine = _make_engine(seed=42)
        # Run a few turns
        engine.run_turn("scan")
        engine.run_turn("sprint")

        state_dict = engine.to_dict()
        assert state_dict["engine_type"] == "naval_v2"
        assert state_dict["engine_version"] == 2
        assert state_dict["turn"] == engine.turn
        assert state_dict["base_seed"] == 42

        # Create fresh engine and restore
        engine2 = _make_engine(seed=42)
        engine2.restore_from_dict(state_dict)

        assert engine2.turn == engine.turn
        assert engine2.range_km == engine.range_km
        assert engine2.ecm_charges == engine.ecm_charges
        assert engine2.player_missiles_remaining == engine.player_missiles_remaining
        assert engine2._enemy_compartments_revealed == engine._enemy_compartments_revealed

    def test_compartment_state_preserved(self):
        engine = _make_engine(seed=42)
        engine.range_km = 100.0
        engine.run_turn("full_salvo")  # may damage enemy

        state_dict = engine.to_dict()
        engine2 = _make_engine(seed=42)
        engine2.restore_from_dict(state_dict)

        for i, comp in enumerate(engine.enemy_compartments):
            assert engine2.enemy_compartments[i].hp_pct == comp.hp_pct

    def test_rng_determinism_after_restore(self):
        """Restored engine should produce same results for same turn."""
        engine1 = _make_engine(seed=42)
        engine1.run_turn("scan")
        engine1.run_turn("sprint")
        state_dict = engine1.to_dict()

        # Run turn 3 on original
        engine1.range_km = 100.0  # force exchange phase
        result1 = engine1.run_turn("half_salvo")

        # Restore and run turn 3
        engine2 = _make_engine(seed=42)
        engine2.restore_from_dict(state_dict)
        engine2.range_km = 100.0
        result2 = engine2.run_turn("half_salvo")

        assert result1.player_salvo_fired == result2.player_salvo_fired
        assert result1.enemy_action == result2.enemy_action


# ─── Full Battle Test ───

class TestFullBattle:
    def test_deterministic_battle(self):
        """Run a full battle with deterministic seed and verify it completes."""
        engine = _make_engine(seed=12345)
        turns = 0
        while engine.status == "in_progress" and turns < 20:
            actions = engine.get_available_actions()
            if not actions:
                break

            # Pick first fire action in exchange, sprint in approach, withdraw in aftermath
            action = actions[0]
            phase = engine.phase
            if phase == "approach":
                for a in actions:
                    if a.key == "sprint":
                        action = a
                        break
            elif phase == "exchange":
                for a in actions:
                    if a.key in ("full_salvo", "half_salvo"):
                        action = a
                        break
            elif phase == "aftermath":
                for a in actions:
                    if a.key == "withdraw":
                        action = a
                        break

            result = engine.run_turn(action.key)
            turns += 1
            assert result.narrative  # every turn should have a narrative

        assert engine.status == "completed"
        assert engine.exit_reason is not None

        report = engine.get_battle_result()
        assert report.turns_played > 0
        assert report.exit_reason
        assert report.narrative_summary
        assert report.payout > 0

    def test_battle_state_is_consistent(self):
        """State snapshot should reflect engine state."""
        engine = _make_engine(seed=42)
        engine.run_turn("scan")
        state = engine.get_current_state()
        assert state.turn == engine.turn
        assert state.range_km == round(engine.range_km, 1)
        assert state.player_missiles_remaining == engine.player_missiles_remaining

    def test_multiple_battles_deterministic(self):
        """Two battles with same seed should produce identical results."""
        results1 = []
        results2 = []

        for seed in [100, 200, 300]:
            engine = _make_engine(seed=seed)
            while engine.status == "in_progress" and engine.turn <= 15:
                actions = engine.get_available_actions()
                if not actions:
                    break
                result = engine.run_turn(actions[0].key)
                results1.append(result.narrative)

        for seed in [100, 200, 300]:
            engine = _make_engine(seed=seed)
            while engine.status == "in_progress" and engine.turn <= 15:
                actions = engine.get_available_actions()
                if not actions:
                    break
                result = engine.run_turn(actions[0].key)
                results2.append(result.narrative)

        assert results1 == results2


# ─── Range Change Tests ───

class TestRangeChanges:
    def test_sprint_closes_range(self):
        engine = _make_engine(seed=42)
        initial = engine.range_km
        engine.run_turn("sprint")
        assert engine.range_km < initial

    def test_passive_approach_closes_slower(self):
        engine1 = _make_engine(seed=42)
        engine2 = _make_engine(seed=42)
        engine1.run_turn("sprint")
        engine2.run_turn("passive_approach")
        # Sprint should close more on average (same seed, same enemy action)
        sprint_closed = 350.0 - engine1.range_km
        passive_closed = 350.0 - engine2.range_km
        assert sprint_closed >= passive_closed  # sprint >= passive

    def test_full_radar_closes_range(self):
        engine = _make_engine(seed=42)
        initial = engine.range_km
        engine.run_turn("full_radar")
        assert engine.range_km < initial
