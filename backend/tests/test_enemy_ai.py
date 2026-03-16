"""Tests for the enemy AI doctrine system."""

import random
import pytest
from app.engine.enemy_ai import (
    EnemyDoctrine,
    AIRCRAFT_DOCTRINE,
    get_doctrine,
    choose_enemy_action,
)


VALID_ACTIONS = {
    "fire_bvr", "fire_ir", "guns", "scan", "ecm",
    "close", "extend", "break_turn", "disengage",
}


class TestGetDoctrine:
    """Tests for get_doctrine() — aircraft to doctrine mapping."""

    def test_su30mki_is_aggressive(self):
        assert get_doctrine("Su-30MKI") == EnemyDoctrine.AGGRESSIVE

    def test_f15e_is_aggressive(self):
        assert get_doctrine("F-15E Strike Eagle") == EnemyDoctrine.AGGRESSIVE

    def test_rafale_is_standoff(self):
        assert get_doctrine("Dassault Rafale") == EnemyDoctrine.STANDOFF

    def test_typhoon_is_standoff(self):
        assert get_doctrine("Eurofighter Typhoon") == EnemyDoctrine.STANDOFF

    def test_f16c_is_cautious(self):
        assert get_doctrine("F-16C Fighting Falcon") == EnemyDoctrine.CAUTIOUS

    def test_jf17_is_unpredictable(self):
        assert get_doctrine("JF-17 Thunder") == EnemyDoctrine.UNPREDICTABLE

    def test_unknown_aircraft_returns_cautious(self):
        assert get_doctrine("Imaginary Fighter X-99") == EnemyDoctrine.CAUTIOUS

    def test_empty_string_returns_cautious(self):
        assert get_doctrine("") == EnemyDoctrine.CAUTIOUS


class TestChooseEnemyActionOverrides:
    """Tests for situational overrides in choose_enemy_action()."""

    def test_bingo_fuel_always_disengages(self):
        """Any fuel < 15% should always return 'disengage'."""
        for seed in range(50):
            rng = random.Random(seed)
            action = choose_enemy_action(
                doctrine=EnemyDoctrine.AGGRESSIVE,
                zone="BVR",
                enemy_damage_pct=0,
                enemy_fuel_pct=10,
                enemy_has_bvr=True,
                enemy_has_ir=True,
                rng=rng,
            )
            assert action == "disengage", f"Seed {seed}: expected disengage at bingo fuel, got {action}"

    def test_winchester_no_weapons_bvr_zone_disengages(self):
        """No BVR and no IR in BVR zone -> disengage."""
        for seed in range(20):
            rng = random.Random(seed)
            action = choose_enemy_action(
                doctrine=EnemyDoctrine.AGGRESSIVE,
                zone="BVR",
                enemy_damage_pct=0,
                enemy_fuel_pct=80,
                enemy_has_bvr=False,
                enemy_has_ir=False,
                rng=rng,
            )
            assert action == "disengage"

    def test_winchester_wvr_zone_guns_or_disengage(self):
        """No BVR + no IR in WVR zone -> guns or disengage."""
        results = set()
        for seed in range(100):
            rng = random.Random(seed)
            action = choose_enemy_action(
                doctrine=EnemyDoctrine.AGGRESSIVE,
                zone="WVR",
                enemy_damage_pct=0,
                enemy_fuel_pct=80,
                enemy_has_bvr=False,
                enemy_has_ir=False,
                rng=rng,
            )
            assert action in ("guns", "disengage"), f"Seed {seed}: unexpected action {action}"
            results.add(action)
        # Over 100 samples, both should appear
        assert "guns" in results
        assert "disengage" in results

    def test_heavily_damaged_tends_to_extend_or_disengage(self):
        """Damage > 60% should lean toward extend/disengage."""
        extend_or_disengage_count = 0
        total = 200
        for seed in range(total):
            rng = random.Random(seed)
            action = choose_enemy_action(
                doctrine=EnemyDoctrine.AGGRESSIVE,
                zone="BVR",
                enemy_damage_pct=70,
                enemy_fuel_pct=80,
                enemy_has_bvr=True,
                enemy_has_ir=True,
                rng=rng,
            )
            if action in ("extend", "disengage"):
                extend_or_disengage_count += 1
        # At 70% damage, 70% chance of override -> should see >40% extend/disengage
        ratio = extend_or_disengage_count / total
        assert ratio > 0.4, f"Expected >40% extend/disengage, got {ratio:.1%}"


class TestChooseEnemyActionValid:
    """Tests that choose_enemy_action always returns valid actions."""

    @pytest.mark.parametrize("zone", ["BVR", "TRANSITION", "WVR"])
    @pytest.mark.parametrize("doctrine", list(EnemyDoctrine))
    def test_always_returns_valid_action(self, doctrine, zone):
        for seed in range(20):
            rng = random.Random(seed)
            action = choose_enemy_action(
                doctrine=doctrine,
                zone=zone,
                enemy_damage_pct=20,
                enemy_fuel_pct=60,
                enemy_has_bvr=True,
                enemy_has_ir=True,
                rng=rng,
            )
            assert action in VALID_ACTIONS, f"Invalid action: {action}"

    def test_guns_only_in_wvr(self):
        """Guns should only be returned when zone is WVR."""
        for seed in range(200):
            rng = random.Random(seed)
            for zone in ["BVR", "TRANSITION"]:
                action = choose_enemy_action(
                    doctrine=EnemyDoctrine.AGGRESSIVE,
                    zone=zone,
                    enemy_damage_pct=10,
                    enemy_fuel_pct=80,
                    enemy_has_bvr=True,
                    enemy_has_ir=True,
                    rng=rng,
                )
                assert action != "guns", \
                    f"Seed {seed}, zone {zone}: guns returned outside WVR"


class TestDoctrinePreferences:
    """Statistical tests for doctrine action preferences."""

    def test_aggressive_bvr_tends_to_fire_or_close(self):
        """AGGRESSIVE in BVR should frequently fire_bvr or close."""
        fire_or_close = 0
        total = 500
        for seed in range(total):
            rng = random.Random(seed)
            action = choose_enemy_action(
                doctrine=EnemyDoctrine.AGGRESSIVE,
                zone="BVR",
                enemy_damage_pct=0,
                enemy_fuel_pct=80,
                enemy_has_bvr=True,
                enemy_has_ir=True,
                rng=rng,
            )
            if action in ("fire_bvr", "close"):
                fire_or_close += 1
        ratio = fire_or_close / total
        assert ratio > 0.40, \
            f"Expected >40% fire_bvr/close for AGGRESSIVE in BVR, got {ratio:.1%}"

    def test_standoff_bvr_prefers_fire_bvr(self):
        """STANDOFF in BVR should heavily prefer fire_bvr."""
        fire_count = 0
        total = 500
        for seed in range(total):
            rng = random.Random(seed)
            action = choose_enemy_action(
                doctrine=EnemyDoctrine.STANDOFF,
                zone="BVR",
                enemy_damage_pct=0,
                enemy_fuel_pct=80,
                enemy_has_bvr=True,
                enemy_has_ir=True,
                rng=rng,
            )
            if action == "fire_bvr":
                fire_count += 1
        ratio = fire_count / total
        assert ratio > 0.30, \
            f"Expected >30% fire_bvr for STANDOFF in BVR, got {ratio:.1%}"

    def test_cautious_wvr_prefers_defensive(self):
        """CAUTIOUS in WVR should lean defensive (break_turn, disengage, extend)."""
        defensive = 0
        total = 500
        for seed in range(total):
            rng = random.Random(seed)
            action = choose_enemy_action(
                doctrine=EnemyDoctrine.CAUTIOUS,
                zone="WVR",
                enemy_damage_pct=0,
                enemy_fuel_pct=80,
                enemy_has_bvr=True,
                enemy_has_ir=True,
                rng=rng,
            )
            if action in ("break_turn", "disengage", "extend"):
                defensive += 1
        ratio = defensive / total
        assert ratio > 0.20, \
            f"Expected >20% defensive for CAUTIOUS in WVR, got {ratio:.1%}"
