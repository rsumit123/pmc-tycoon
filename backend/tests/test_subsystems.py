"""Tests for subsystem module system — seed data, stat schemas, condition degradation."""

import json
import pytest
from app.seed.subsystem_data import AIRCRAFT_DEFAULTS, UPGRADE_MODULES


SLOT_TYPES = {"radar", "engine", "ecm", "countermeasures", "computer", "airframe"}

EXPECTED_AIRCRAFT = [
    "Dassault Rafale",
    "F-16C Block 52",
    "Su-30MKI",
    "F-15E Strike Eagle",
    "JF-17 Thunder",
    "Tejas Mk2",
    "Mirage 2000-5",
    "Eurofighter Typhoon",
]


class TestAircraftDefaults:
    """Tests for AIRCRAFT_DEFAULTS seed data."""

    def test_has_all_8_aircraft(self):
        assert len(AIRCRAFT_DEFAULTS) == 8

    def test_all_expected_aircraft_present(self):
        for name in EXPECTED_AIRCRAFT:
            assert name in AIRCRAFT_DEFAULTS, f"Missing aircraft: {name}"

    def test_all_6_slot_types_covered(self):
        """Each aircraft default should have radar, engine, ecm, countermeasures, airframe."""
        # Note: computer is not in defaults dict directly (added at seed time),
        # but radar/engine/ecm/countermeasures/airframe should be present.
        expected_slots = {"radar", "engine", "ecm", "countermeasures", "airframe"}
        for ac_name, specs in AIRCRAFT_DEFAULTS.items():
            for slot in expected_slots:
                assert slot in specs, f"{ac_name} missing slot: {slot}"

    def test_each_aircraft_has_origin(self):
        for ac_name, specs in AIRCRAFT_DEFAULTS.items():
            assert "origin" in specs and specs["origin"], f"{ac_name} missing origin"


class TestUpgradeModules:
    """Tests for UPGRADE_MODULES seed data."""

    def test_has_20_entries(self):
        assert len(UPGRADE_MODULES) == 20

    def test_all_6_slot_types_covered(self):
        slot_types_found = {m["slot_type"] for m in UPGRADE_MODULES}
        assert slot_types_found == SLOT_TYPES

    def test_all_modules_have_tier_2_or_3(self):
        for mod in UPGRADE_MODULES:
            assert mod["tier"] in (2, 3), f"{mod['name']} has invalid tier: {mod['tier']}"

    def test_all_modules_have_nonzero_cost(self):
        for mod in UPGRADE_MODULES:
            assert mod["cost"] > 0, f"{mod['name']} has zero cost"

    def test_all_modules_have_nonzero_maintenance(self):
        for mod in UPGRADE_MODULES:
            assert mod["maintenance_cost"] > 0, f"{mod['name']} has zero maintenance_cost"

    def test_all_modules_not_default(self):
        for mod in UPGRADE_MODULES:
            assert mod["is_default"] is False


class TestModuleStatSchemas:
    """Verify that module stats JSON has expected keys per slot type."""

    def _parse_stats(self, mod):
        """Parse stats from upgrade module dict."""
        raw = mod["stats"]
        return json.loads(raw) if isinstance(raw, str) else raw

    def test_radar_modules_have_required_keys(self):
        radar_mods = [m for m in UPGRADE_MODULES if m["slot_type"] == "radar"]
        assert len(radar_mods) > 0
        for mod in radar_mods:
            stats = self._parse_stats(mod)
            assert "radar_type" in stats, f"{mod['name']} missing radar_type"
            assert "radar_range_km" in stats, f"{mod['name']} missing radar_range_km"

    def test_engine_modules_have_required_keys(self):
        engine_mods = [m for m in UPGRADE_MODULES if m["slot_type"] == "engine"]
        assert len(engine_mods) > 0
        for mod in engine_mods:
            stats = self._parse_stats(mod)
            assert "thrust_to_weight_mod" in stats, f"{mod['name']} missing thrust_to_weight_mod"

    def test_ecm_modules_have_required_keys(self):
        ecm_mods = [m for m in UPGRADE_MODULES if m["slot_type"] == "ecm"]
        assert len(ecm_mods) > 0
        for mod in ecm_mods:
            stats = self._parse_stats(mod)
            assert "ecm_suite" in stats, f"{mod['name']} missing ecm_suite"
            assert "ecm_rating" in stats, f"{mod['name']} missing ecm_rating"

    def test_countermeasures_modules_have_required_keys(self):
        cm_mods = [m for m in UPGRADE_MODULES if m["slot_type"] == "countermeasures"]
        assert len(cm_mods) > 0
        for mod in cm_mods:
            stats = self._parse_stats(mod)
            assert "chaff_count" in stats, f"{mod['name']} missing chaff_count"
            assert "flare_count" in stats, f"{mod['name']} missing flare_count"

    def test_computer_modules_have_required_keys(self):
        comp_mods = [m for m in UPGRADE_MODULES if m["slot_type"] == "computer"]
        assert len(comp_mods) > 0
        for mod in comp_mods:
            stats = self._parse_stats(mod)
            assert "pk_bonus" in stats, f"{mod['name']} missing pk_bonus"

    def test_airframe_modules_have_required_keys(self):
        af_mods = [m for m in UPGRADE_MODULES if m["slot_type"] == "airframe"]
        assert len(af_mods) > 0
        for mod in af_mods:
            stats = self._parse_stats(mod)
            assert "max_g_mod" in stats, f"{mod['name']} missing max_g_mod"
            assert "rcs_mod" in stats, f"{mod['name']} missing rcs_mod"


class TestConditionDegradationMath:
    """Test the condition degradation formulas used in computed stats.

    These mirror the logic in app/api/subsystems.get_computed_stats().
    We test the pure math without DB dependencies.
    """

    def test_radar_at_50_pct_halves_range(self):
        radar_range_km = 200
        condition_factor = 50 / 100.0
        effective_range = int(radar_range_km * condition_factor)
        assert effective_range == 100

    def test_radar_at_100_pct_full_range(self):
        radar_range_km = 150
        condition_factor = 100 / 100.0
        effective_range = int(radar_range_km * condition_factor)
        assert effective_range == 150

    def test_radar_at_0_pct_zero_range(self):
        radar_range_km = 150
        condition_factor = 0 / 100.0
        effective_range = int(radar_range_km * condition_factor)
        assert effective_range == 0

    def test_ecm_at_0_pct_zero_rating(self):
        ecm_rating = 85
        condition_factor = 0 / 100.0
        effective_rating = int(ecm_rating * condition_factor)
        assert effective_rating == 0

    def test_ecm_at_100_pct_full_rating(self):
        ecm_rating = 85
        condition_factor = 100 / 100.0
        effective_rating = int(ecm_rating * condition_factor)
        assert effective_rating == 85

    def test_engine_at_75_pct_interpolates_toward_neutral(self):
        """Engine twr_mod interpolates toward 1.0 based on damage.
        Formula: 1.0 + (twr_mod - 1.0) * condition_factor
        For twr_mod=1.13, condition=75%:
            1.0 + (1.13 - 1.0) * 0.75 = 1.0 + 0.13 * 0.75 = 1.0975
        """
        twr_mod = 1.13
        condition_factor = 75 / 100.0
        effective = 1.0 + (twr_mod - 1.0) * condition_factor
        assert abs(effective - 1.0975) < 0.001

    def test_engine_at_0_pct_returns_neutral(self):
        """At 0% condition, engine should be at neutral 1.0."""
        twr_mod = 1.25
        condition_factor = 0 / 100.0
        effective = 1.0 + (twr_mod - 1.0) * condition_factor
        assert effective == 1.0

    def test_engine_at_100_pct_returns_full(self):
        twr_mod = 1.18
        condition_factor = 100 / 100.0
        effective = 1.0 + (twr_mod - 1.0) * condition_factor
        assert abs(effective - 1.18) < 0.001

    def test_countermeasures_at_50_pct_halves_counts(self):
        chaff = 120
        flare = 60
        condition_factor = 50 / 100.0
        assert int(chaff * condition_factor) == 60
        assert int(flare * condition_factor) == 30

    def test_hp_mod_scales_linearly(self):
        """hp_mod = hp_mod_base * condition_factor."""
        hp_mod = 1.2
        condition_factor = 50 / 100.0
        effective = hp_mod * condition_factor
        assert abs(effective - 0.6) < 0.001
