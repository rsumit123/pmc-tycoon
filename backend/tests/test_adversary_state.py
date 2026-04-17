from app.engine.adversary.state import (
    FACTIONS,
    DOCTRINE_LADDER,
    OOB_2026_Q2,
    empty_state,
    validate_state,
)


def test_factions_are_three_locked_values():
    assert FACTIONS == ["PLAAF", "PAF", "PLAN"]


def test_doctrine_ladder_has_three_tiers_per_faction():
    for faction in FACTIONS:
        assert len(DOCTRINE_LADDER[faction]) == 3


def test_plaaf_starting_oob_has_expected_inventory():
    st = OOB_2026_Q2["PLAAF"]
    assert st["inventory"]["j20a"] == 500
    assert st["inventory"]["j35a"] >= 1
    assert st["doctrine"] == "conservative"
    assert "hotan" in st["forward_bases"]


def test_paf_starting_oob_has_zero_j35e():
    st = OOB_2026_Q2["PAF"]
    assert st["inventory"].get("j35e", 0) == 0
    assert st["inventory"]["j10ce"] == 20
    assert st["doctrine"] == "conservative"


def test_plan_starting_oob_has_three_carriers():
    st = OOB_2026_Q2["PLAN"]
    assert st["inventory"]["liaoning"] == 1
    assert st["inventory"]["shandong"] == 1
    assert st["inventory"]["fujian"] == 1
    assert st["doctrine"] == "coastal_defense"


def test_empty_state_has_all_required_keys():
    st = empty_state()
    assert set(st.keys()) == {"inventory", "doctrine", "active_systems", "forward_bases"}
    assert st["inventory"] == {}
    assert st["active_systems"] == []
    assert st["forward_bases"] == []


def test_validate_state_accepts_valid():
    validate_state({"inventory": {"j20a": 500}, "doctrine": "conservative",
                    "active_systems": [], "forward_bases": []})


def test_validate_state_rejects_missing_key():
    import pytest
    with pytest.raises(ValueError):
        validate_state({"inventory": {}, "doctrine": "conservative", "active_systems": []})


def test_validate_state_rejects_negative_count():
    import pytest
    with pytest.raises(ValueError):
        validate_state({"inventory": {"j20a": -1}, "doctrine": "conservative",
                        "active_systems": [], "forward_bases": []})
