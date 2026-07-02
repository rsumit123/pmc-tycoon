import pytest

from app.engine.engagement import (
    EngagementResultError,
    validate_result,
    residual_forces,
    merge_outcomes,
)


def _ps():
    return {
        "adversary_force": [
            {"platform_id": "jf17_blk3", "count": 6, "role": "strike"},
            {"platform_id": "j10c", "count": 4, "role": "escort"},
        ],
        "objective": {
            "success_threshold": {"adv_kills_min": 3, "ind_losses_max": 2},
        },
        "roe": "weapons_free",
    }


def _committed_force():
    return {
        "squadrons": [
            {"squadron_id": 1, "airframes": 4},
            {"squadron_id": 2, "airframes": 6},
        ],
        "support": {"awacs": False, "tanker": False, "sead_package": False},
        "roe": "weapons_free",
    }


def _squadron_rows():
    return [
        {"id": 1, "call_sign": "Falcon", "platform_id": "su30mki", "base_id": 5, "strength": 16},
        {"id": 2, "call_sign": "Cobra", "platform_id": "tejas_mk1a", "base_id": 6, "strength": 12},
    ]


def _loadouts():
    return {
        "su30mki": {"bvr": ["astra_mk1"], "wvr": ["r73"]},
        "tejas_mk1a": {"bvr": ["astra_mk1"], "wvr": ["r73"]},
    }


def _depot_stock():
    return {
        (5, "astra_mk1"): 40,
        (5, "r73"): 20,
        (6, "astra_mk1"): 10,
        (6, "r73"): 5,
    }


def _result(**overrides):
    base = {
        "player_squadron_id": 1,
        "flight_kills": {"jf17_blk3": 2},
        "flight_losses": 1,
        "munitions_expended": {"astra_mk1": 3},
        "flares_used": 2,
        "disengaged": False,
    }
    base.update(overrides)
    return base


# --- validate_result: happy path -----------------------------------------

def test_validate_result_happy_path_does_not_raise():
    validate_result(_result(), _ps(), _committed_force(), _depot_stock(), _squadron_rows(), _loadouts())


# --- validate_result: cap rules -------------------------------------------

def test_validate_result_rejects_uncommitted_squadron():
    with pytest.raises(EngagementResultError):
        validate_result(
            _result(player_squadron_id=99), _ps(), _committed_force(),
            _depot_stock(), _squadron_rows(), _loadouts(),
        )


def test_validate_result_rejects_flight_losses_exceeding_flight_size():
    # flight size = min(4, 4) = 4; 5 losses is too many
    with pytest.raises(EngagementResultError):
        validate_result(
            _result(flight_losses=5), _ps(), _committed_force(),
            _depot_stock(), _squadron_rows(), _loadouts(),
        )


def test_validate_result_rejects_negative_flight_losses():
    with pytest.raises(EngagementResultError):
        validate_result(
            _result(flight_losses=-1), _ps(), _committed_force(),
            _depot_stock(), _squadron_rows(), _loadouts(),
        )


def test_validate_result_rejects_kills_exceeding_platform_count():
    with pytest.raises(EngagementResultError):
        validate_result(
            _result(flight_kills={"jf17_blk3": 7}), _ps(), _committed_force(),
            _depot_stock(), _squadron_rows(), _loadouts(),
        )


def test_validate_result_rejects_total_kills_exceeding_adversary_total():
    with pytest.raises(EngagementResultError):
        validate_result(
            _result(flight_kills={"jf17_blk3": 6, "j10c": 4, "phantom": 1}), _ps(), _committed_force(),
            _depot_stock(), _squadron_rows(), _loadouts(),
        )
    # more targeted: platform not in adversary_force at all
    with pytest.raises(EngagementResultError):
        validate_result(
            _result(flight_kills={"f16": 1}), _ps(), _committed_force(),
            _depot_stock(), _squadron_rows(), _loadouts(),
        )


def test_validate_result_rejects_weapon_not_in_loadout():
    with pytest.raises(EngagementResultError):
        validate_result(
            _result(munitions_expended={"meteor": 1}), _ps(), _committed_force(),
            _depot_stock(), _squadron_rows(), _loadouts(),
        )


def test_validate_result_rejects_munitions_exceeding_depot_stock():
    with pytest.raises(EngagementResultError):
        validate_result(
            _result(munitions_expended={"astra_mk1": 999}), _ps(), _committed_force(),
            _depot_stock(), _squadron_rows(), _loadouts(),
        )


def test_validate_result_rejects_flares_exceeding_stock():
    with pytest.raises(EngagementResultError):
        validate_result(
            _result(flares_used=99), _ps(), _committed_force(),
            _depot_stock(), _squadron_rows(), _loadouts(), flare_stock=6,
        )


def test_validate_result_rejects_negative_munitions():
    with pytest.raises(EngagementResultError):
        validate_result(
            _result(munitions_expended={"astra_mk1": -1}), _ps(), _committed_force(),
            _depot_stock(), _squadron_rows(), _loadouts(),
        )


# --- residual_forces --------------------------------------------------------

def test_residual_forces_reduces_adversary_counts_and_removes_zeroed_entries():
    ps_res, cf_res = residual_forces(_ps(), _committed_force(), _result(flight_kills={"jf17_blk3": 6}))
    platforms = {e["platform_id"]: e["count"] for e in ps_res["adversary_force"]}
    assert "jf17_blk3" not in platforms
    assert platforms["j10c"] == 4


def test_residual_forces_reduces_adversary_counts_partial():
    ps_res, _ = residual_forces(_ps(), _committed_force(), _result(flight_kills={"jf17_blk3": 2}))
    platforms = {e["platform_id"]: e["count"] for e in ps_res["adversary_force"]}
    assert platforms["jf17_blk3"] == 4
    assert platforms["j10c"] == 4


def test_residual_forces_removes_player_flight_airframes():
    # squadron 1 has 4 committed airframes; flight size = min(4,4) = 4 -> fully removed
    _, cf_res = residual_forces(_ps(), _committed_force(), _result(player_squadron_id=1))
    remaining_ids = [s["squadron_id"] for s in cf_res["squadrons"]]
    assert 1 not in remaining_ids
    assert 2 in remaining_ids


def test_residual_forces_removes_only_flight_size_when_squadron_larger():
    cf = _committed_force()
    cf["squadrons"][1]["airframes"] = 10  # squadron 2 has 10 airframes
    _, cf_res = residual_forces(_ps(), cf, _result(player_squadron_id=2))
    sq2 = next(s for s in cf_res["squadrons"] if s["squadron_id"] == 2)
    assert sq2["airframes"] == 6  # 10 - min(4,10)


def test_residual_forces_zero_residual_when_all_adversary_killed():
    ps_res, cf_res = residual_forces(
        _ps(), _committed_force(),
        _result(player_squadron_id=1, flight_kills={"jf17_blk3": 6, "j10c": 4}),
    )
    assert ps_res["adversary_force"] == []


def test_residual_forces_does_not_mutate_inputs():
    ps = _ps()
    cf = _committed_force()
    residual_forces(ps, cf, _result())
    assert ps["adversary_force"][0]["count"] == 6
    assert cf["squadrons"][0]["airframes"] == 4


# --- merge_outcomes ----------------------------------------------------------

def test_merge_outcomes_sums_totals_with_residual():
    residual_outcome = {
        "adv_kia": 1, "ind_kia": 0,
        "adv_airframes_lost": 1, "ind_airframes_lost": 0,
        "roe": "weapons_free", "support": {"awacs": True, "tanker": False, "sead_package": False},
        "munitions_expended": [{"weapon": "r77", "count": 2, "unit_cost_cr": 4, "line_total_cr": 8}],
        "munitions_cost_total_cr": 8,
    }
    outcome = merge_outcomes(_result(flight_kills={"jf17_blk3": 2}, flight_losses=1), residual_outcome, _ps(), flight_airframes=4)
    assert outcome["adv_kia"] == 3
    assert outcome["ind_kia"] == 1
    assert outcome["adv_airframes_lost"] == 3
    assert outcome["ind_airframes_lost"] == 1


def test_merge_outcomes_objective_met_true_when_threshold_reached():
    # threshold: adv_kills_min=3, ind_losses_max=2
    outcome = merge_outcomes(
        _result(flight_kills={"jf17_blk3": 3}, flight_losses=1), None, _ps(), flight_airframes=4,
    )
    assert outcome["adv_kia"] == 3
    assert outcome["ind_kia"] == 1
    assert outcome["objective_met"] is True


def test_merge_outcomes_objective_met_false_when_ind_losses_exceed_max():
    outcome = merge_outcomes(
        _result(flight_kills={"jf17_blk3": 5}, flight_losses=3), None, _ps(), flight_airframes=4,
    )
    assert outcome["objective_met"] is False


def test_merge_outcomes_objective_met_false_when_adv_kills_below_min():
    outcome = merge_outcomes(
        _result(flight_kills={"jf17_blk3": 1}, flight_losses=0), None, _ps(), flight_airframes=4,
    )
    assert outcome["objective_met"] is False


def test_merge_outcomes_zero_residual_path():
    outcome = merge_outcomes(_result(flight_kills={"jf17_blk3": 1}, flight_losses=0), None, _ps(), flight_airframes=4)
    assert outcome["adv_kia"] == 1
    assert outcome["ind_kia"] == 0
    assert outcome["adv_airframes_lost"] == 1
    assert outcome["ind_airframes_lost"] == 0


def test_merge_outcomes_munitions_pricing_with_real_weapons():
    outcome = merge_outcomes(
        _result(munitions_expended={"astra_mk1": 3}), None, _ps(), flight_airframes=4,
    )
    player_entries = [m for m in outcome["munitions_expended"] if m["weapon"] == "astra_mk1"]
    assert len(player_entries) == 1
    entry = player_entries[0]
    assert entry["count"] == 3
    assert entry["unit_cost_cr"] == 7  # from WEAPONS["astra_mk1"]
    assert entry["line_total_cr"] == 21
    assert outcome["munitions_cost_total_cr"] == 21


def test_merge_outcomes_munitions_cost_adds_to_residual_cost():
    residual_outcome = {
        "adv_kia": 0, "ind_kia": 0, "adv_airframes_lost": 0, "ind_airframes_lost": 0,
        "roe": "weapons_free", "support": {},
        "munitions_expended": [{"weapon": "r77", "count": 1, "unit_cost_cr": 4, "line_total_cr": 4}],
        "munitions_cost_total_cr": 4,
    }
    outcome = merge_outcomes(
        _result(munitions_expended={"astra_mk1": 2}), residual_outcome, _ps(), flight_airframes=4,
    )
    assert outcome["munitions_cost_total_cr"] == 4 + 14
    weapons = {m["weapon"] for m in outcome["munitions_expended"]}
    assert weapons == {"r77", "astra_mk1"}


def test_merge_outcomes_carries_interactive_and_disengaged_flags():
    outcome = merge_outcomes(_result(disengaged=True), None, _ps(), flight_airframes=4)
    assert outcome["interactive"] is True
    assert outcome["disengaged"] is True
