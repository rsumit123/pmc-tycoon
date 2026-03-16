"""Tests for the R&D research system seed data and tree structure."""

import pytest
from app.seed.research_data import RESEARCH_TREE
from app.seed.subsystem_data import UPGRADE_MODULES

# Parse research tree into structured dicts for easier testing
RESEARCH_ITEMS = []
for entry in RESEARCH_TREE:
    name, desc, branch, tier, cost_rp, cost_money, duration, prereq_name, unlocks = entry
    RESEARCH_ITEMS.append({
        "name": name,
        "description": desc,
        "branch": branch,
        "tier": tier,
        "cost_rp": cost_rp,
        "cost_money": cost_money,
        "duration_hours": duration,
        "prerequisite_name": prereq_name,
        "unlocks_module_name": unlocks,
    })

ALL_BRANCHES = {"sensors", "propulsion", "ew", "structures", "weapons"}
RESEARCH_NAMES = {item["name"] for item in RESEARCH_ITEMS}
UPGRADE_MODULE_NAMES = {m["name"] for m in UPGRADE_MODULES}


class TestResearchBranches:
    """Verify all 5 research branches are present."""

    def test_all_5_branches_present(self):
        branches_found = {item["branch"] for item in RESEARCH_ITEMS}
        assert branches_found == ALL_BRANCHES

    def test_sensors_branch_has_items(self):
        count = sum(1 for i in RESEARCH_ITEMS if i["branch"] == "sensors")
        assert count >= 3

    def test_propulsion_branch_has_items(self):
        count = sum(1 for i in RESEARCH_ITEMS if i["branch"] == "propulsion")
        assert count >= 3

    def test_ew_branch_has_items(self):
        count = sum(1 for i in RESEARCH_ITEMS if i["branch"] == "ew")
        assert count >= 3

    def test_structures_branch_has_items(self):
        count = sum(1 for i in RESEARCH_ITEMS if i["branch"] == "structures")
        assert count >= 3

    def test_weapons_branch_has_items(self):
        count = sum(1 for i in RESEARCH_ITEMS if i["branch"] == "weapons")
        assert count >= 3


class TestResearchTiers:
    """Verify tier structure within each branch."""

    @pytest.mark.parametrize("branch", list(ALL_BRANCHES))
    def test_branch_has_tier_1(self, branch):
        tier1 = [i for i in RESEARCH_ITEMS if i["branch"] == branch and i["tier"] == 1]
        assert len(tier1) >= 1, f"{branch} has no tier 1 items"

    @pytest.mark.parametrize("branch", list(ALL_BRANCHES))
    def test_branch_has_tier_2(self, branch):
        tier2 = [i for i in RESEARCH_ITEMS if i["branch"] == branch and i["tier"] == 2]
        assert len(tier2) >= 1, f"{branch} has no tier 2 items"

    @pytest.mark.parametrize("branch", list(ALL_BRANCHES))
    def test_branch_has_tier_3(self, branch):
        tier3 = [i for i in RESEARCH_ITEMS if i["branch"] == branch and i["tier"] == 3]
        assert len(tier3) >= 1, f"{branch} has no tier 3 items"


class TestResearchPrerequisites:
    """Verify prerequisite chain integrity."""

    def test_tier_1_items_have_no_prerequisite(self):
        tier1 = [i for i in RESEARCH_ITEMS if i["tier"] == 1]
        for item in tier1:
            assert item["prerequisite_name"] is None, \
                f"Tier 1 item '{item['name']}' has prerequisite: {item['prerequisite_name']}"

    def test_tier_2_plus_have_valid_prerequisite(self):
        for item in RESEARCH_ITEMS:
            if item["tier"] >= 2:
                prereq = item["prerequisite_name"]
                assert prereq is not None, \
                    f"Tier {item['tier']} item '{item['name']}' has no prerequisite"
                assert prereq in RESEARCH_NAMES, \
                    f"'{item['name']}' prerequisite '{prereq}' not found in research tree"

    def test_prerequisites_point_to_lower_or_equal_tier(self):
        name_to_tier = {i["name"]: i["tier"] for i in RESEARCH_ITEMS}
        for item in RESEARCH_ITEMS:
            if item["prerequisite_name"]:
                prereq_tier = name_to_tier[item["prerequisite_name"]]
                assert prereq_tier < item["tier"], \
                    f"'{item['name']}' (tier {item['tier']}) prereq '{item['prerequisite_name']}' is tier {prereq_tier}"


class TestResearchUnlocks:
    """Verify module unlock references."""

    def test_unlocks_reference_real_upgrade_modules(self):
        for item in RESEARCH_ITEMS:
            if item["unlocks_module_name"]:
                assert item["unlocks_module_name"] in UPGRADE_MODULE_NAMES, \
                    f"'{item['name']}' unlocks '{item['unlocks_module_name']}' which is not in UPGRADE_MODULES"

    def test_tier_1_foundation_items_unlock_no_module(self):
        tier1 = [i for i in RESEARCH_ITEMS if i["tier"] == 1]
        for item in tier1:
            assert item["unlocks_module_name"] is None, \
                f"Tier 1 item '{item['name']}' should not unlock a module, but unlocks '{item['unlocks_module_name']}'"

    def test_all_upgrade_modules_are_unlockable(self):
        """Every upgrade module should be unlockable by some research item."""
        unlockable = {i["unlocks_module_name"] for i in RESEARCH_ITEMS if i["unlocks_module_name"]}
        for mod_name in UPGRADE_MODULE_NAMES:
            assert mod_name in unlockable, \
                f"Module '{mod_name}' has no research item that unlocks it"

    def test_research_costs_are_positive(self):
        for item in RESEARCH_ITEMS:
            assert item["cost_rp"] > 0, f"'{item['name']}' has non-positive cost_rp"
            assert item["cost_money"] > 0, f"'{item['name']}' has non-positive cost_money"
            assert item["duration_hours"] > 0, f"'{item['name']}' has non-positive duration"
