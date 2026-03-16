"""Tests for rank progression and pilot XP/levelling system."""

import pytest
from app.engine.progression import RANKS, get_rank, calc_pilot_level, calc_pilot_skill_bonus


class TestGetRank:
    """Tests for get_rank() — PMC rank thresholds."""

    def test_startup_rank_at_zero(self):
        result = get_rank(0, 0)
        assert result["rank"] == "STARTUP"
        assert result["rank_index"] == 0

    def test_licensed_rank(self):
        result = get_rank(20, 10)
        assert result["rank"] == "LICENSED"
        assert result["rank_index"] == 1

    def test_established_rank(self):
        result = get_rank(40, 25)
        assert result["rank"] == "ESTABLISHED"
        assert result["rank_index"] == 2

    def test_elite_rank(self):
        result = get_rank(60, 50)
        assert result["rank"] == "ELITE"
        assert result["rank_index"] == 3

    def test_legendary_rank(self):
        result = get_rank(80, 100)
        assert result["rank"] == "LEGENDARY"
        assert result["rank_index"] == 4

    # Edge cases

    def test_zero_rep_zero_missions(self):
        result = get_rank(0, 0)
        assert result["rank"] == "STARTUP"
        assert result["next_rank"] == "LICENSED"

    def test_high_rep_high_missions(self):
        result = get_rank(100, 200)
        assert result["rank"] == "LEGENDARY"
        assert result["rank_index"] == 4
        assert result["next_rank"] is None

    def test_high_rep_insufficient_missions(self):
        """rep=80 but only 10 missions — should not reach LEGENDARY."""
        result = get_rank(80, 10)
        assert result["rank"] == "LICENSED"
        assert result["rank_index"] == 1

    def test_high_missions_low_rep(self):
        """Many missions but low reputation."""
        result = get_rank(5, 200)
        assert result["rank"] == "STARTUP"

    def test_next_rank_thresholds_for_startup(self):
        result = get_rank(0, 0)
        assert result["next_rank"] == "LICENSED"
        assert result["next_rep_needed"] == 20
        assert result["next_missions_needed"] == 10

    def test_next_rank_thresholds_for_elite(self):
        result = get_rank(60, 50)
        assert result["next_rank"] == "LEGENDARY"
        assert result["next_rep_needed"] == 80
        assert result["next_missions_needed"] == 100

    def test_legendary_has_no_next_rank(self):
        result = get_rank(80, 100)
        assert result["next_rank"] is None
        # Should return own thresholds when at max
        assert result["next_rep_needed"] == 80
        assert result["next_missions_needed"] == 100

    def test_exactly_at_boundary_qualifies(self):
        """Exact boundary values should qualify for the rank."""
        result = get_rank(40, 25)
        assert result["rank"] == "ESTABLISHED"

    def test_one_below_boundary_does_not_qualify(self):
        """One below either threshold should not qualify."""
        result = get_rank(39, 25)
        assert result["rank"] == "LICENSED"
        result2 = get_rank(40, 24)
        assert result2["rank"] == "LICENSED"


class TestCalcPilotLevel:
    """Tests for calc_pilot_level() — XP thresholds."""

    def test_zero_xp_is_level_1(self):
        assert calc_pilot_level(0) == 1

    def test_xp_100_is_level_2(self):
        assert calc_pilot_level(100) == 2

    def test_xp_300_is_level_3(self):
        assert calc_pilot_level(300) == 3

    def test_xp_600_is_level_4(self):
        assert calc_pilot_level(600) == 4

    def test_xp_1000_is_level_5(self):
        assert calc_pilot_level(1000) == 5

    def test_xp_1500_is_level_6(self):
        assert calc_pilot_level(1500) == 6

    def test_xp_2200_is_level_7(self):
        assert calc_pilot_level(2200) == 7

    def test_xp_3000_is_level_8(self):
        assert calc_pilot_level(3000) == 8

    def test_xp_4000_is_level_9(self):
        assert calc_pilot_level(4000) == 9

    def test_xp_5200_is_level_10(self):
        assert calc_pilot_level(5200) == 10

    def test_caps_at_level_10(self):
        assert calc_pilot_level(999999) == 10

    def test_between_thresholds(self):
        """XP between two thresholds stays at lower level."""
        assert calc_pilot_level(99) == 1
        assert calc_pilot_level(150) == 2
        assert calc_pilot_level(599) == 3

    def test_negative_xp(self):
        """Negative XP should still return level 1."""
        assert calc_pilot_level(-10) == 1


class TestCalcPilotSkillBonus:
    """Tests for calc_pilot_skill_bonus() — +2 per level above 1."""

    def test_level_1_no_bonus(self):
        assert calc_pilot_skill_bonus(1) == 0

    def test_level_2_bonus_2(self):
        assert calc_pilot_skill_bonus(2) == 2

    def test_level_5_bonus_8(self):
        assert calc_pilot_skill_bonus(5) == 8

    def test_level_10_bonus_18(self):
        assert calc_pilot_skill_bonus(10) == 18

    def test_formula_is_correct(self):
        for level in range(1, 11):
            assert calc_pilot_skill_bonus(level) == (level - 1) * 2
