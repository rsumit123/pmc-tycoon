from app.engine.performance import compute_performance


def test_empty_input_returns_zeroed_bundle():
    result = compute_performance(resolved_vignettes=[], platforms_by_id={}, weapons_by_id={})
    assert result["totals"]["total_sorties"] == 0
    assert result["totals"]["total_kills"] == 0
    assert result["totals"]["total_losses"] == 0
    assert result["totals"]["total_munitions_cost_cr"] == 0
    assert result["totals"]["avg_cost_per_kill_cr"] is None
    assert result["platforms"] == []
    assert result["weapons"] == []
    # Factions always return 3 entries in fixed order, even for empty input
    assert [f["faction"] for f in result["factions"]] == ["PLAAF", "PAF", "PLAN"]
    # Support always returns 3 entries in fixed order
    assert [s["asset"] for s in result["support"]] == ["awacs", "tanker", "sead"]


def _mkv(
    faction="PLAAF",
    objective_met=True,
    ind_airframes_lost=2,
    adv_airframes_lost=5,
    munitions_cost=100,
    event_trace=None,
    committed=None,
    support=None,
    eligible=None,
):
    """Helper to build a minimal resolved-vignette dict for aggregation tests."""
    return {
        "planning_state": {
            "adversary_force": [{"faction": faction, "platform_id": "j20a", "count": 4}],
            "eligible_squadrons": eligible or [],
        },
        "committed_force": {
            "squadrons": committed or [],
            "support": support or {"awacs": False, "tanker": False, "sead_package": False},
        },
        "event_trace": event_trace or [],
        "outcome": {
            "objective_met": objective_met,
            "ind_airframes_lost": ind_airframes_lost,
            "adv_airframes_lost": adv_airframes_lost,
            "munitions_cost_total_cr": munitions_cost,
            "munitions_expended": [],
            "support": support or {"awacs": False, "tanker": False, "sead_package": False},
        },
    }


def test_totals_aggregate_across_vignettes():
    vs = [
        _mkv(ind_airframes_lost=2, adv_airframes_lost=5, munitions_cost=100,
             event_trace=[
                 {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "j20a"},
                 {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "j20a"},
                 {"kind": "kill", "side": "adv", "attacker_platform": "j20a", "victim_platform": "rafale_f4"},
             ]),
        _mkv(ind_airframes_lost=1, adv_airframes_lost=3, munitions_cost=50,
             event_trace=[
                 {"kind": "kill", "side": "ind", "attacker_platform": "su30_mki", "victim_platform": "j16"},
             ]),
    ]
    result = compute_performance(vs, platforms_by_id={}, weapons_by_id={})
    assert result["totals"]["total_sorties"] == 2
    assert result["totals"]["total_kills"] == 3  # IAF kills (ind side)
    assert result["totals"]["total_losses"] == 1  # IAF losses (adv side kills)
    assert result["totals"]["total_munitions_cost_cr"] == 150
    # avg_cost_per_kill = 150 / 3 = 50
    assert result["totals"]["avg_cost_per_kill_cr"] == 50


def test_factions_aggregate_and_preserve_order_even_for_unused_factions():
    vs = [
        _mkv(faction="PLAAF", objective_met=True, ind_airframes_lost=1, adv_airframes_lost=5, munitions_cost=200),
        _mkv(faction="PLAAF", objective_met=False, ind_airframes_lost=4, adv_airframes_lost=2, munitions_cost=300),
        _mkv(faction="PAF",   objective_met=True, ind_airframes_lost=0, adv_airframes_lost=3, munitions_cost=100),
        # No PLAN vignettes — should still appear with zeroes
    ]
    result = compute_performance(vs, platforms_by_id={}, weapons_by_id={})
    by_faction = {f["faction"]: f for f in result["factions"]}
    assert [f["faction"] for f in result["factions"]] == ["PLAAF", "PAF", "PLAN"]

    assert by_faction["PLAAF"]["sorties"] == 2
    assert by_faction["PLAAF"]["wins"] == 1
    assert by_faction["PLAAF"]["losses"] == 1
    assert by_faction["PLAAF"]["win_rate_pct"] == 50
    # exchange_ratio = adv_losses_total (5+2=7) / max(1, ind_losses_total (1+4=5)) = 7/5 = 1.4
    assert by_faction["PLAAF"]["avg_exchange_ratio"] == 1.4
    # avg_munitions_cost = (200 + 300) / 2 = 250
    assert by_faction["PLAAF"]["avg_munitions_cost_cr"] == 250

    assert by_faction["PAF"]["sorties"] == 1
    assert by_faction["PAF"]["wins"] == 1
    assert by_faction["PAF"]["win_rate_pct"] == 100

    # PLAN — zero sorties, but entry still present with nulls / zeroes
    assert by_faction["PLAN"]["sorties"] == 0
    assert by_faction["PLAN"]["avg_exchange_ratio"] is None
    assert by_faction["PLAN"]["avg_munitions_cost_cr"] == 0


def test_platform_stats_compute_sorties_kd_win_contribution_first_shot():
    platforms_by_id = {
        "rafale_f4": {"name": "Dassault Rafale F4"},
        "su30_mki":  {"name": "Sukhoi Su-30 MKI"},
    }
    v1 = _mkv(
        faction="PLAAF",
        objective_met=True,
        ind_airframes_lost=1,
        adv_airframes_lost=4,
        eligible=[
            {"squadron_id": 101, "platform_id": "rafale_f4"},
            {"squadron_id": 201, "platform_id": "su30_mki"},
        ],
        committed=[
            {"squadron_id": 101, "airframes": 6},
            {"squadron_id": 201, "airframes": 4},
        ],
        event_trace=[
            {"kind": "detection", "advantage": "ind"},
            # Rafale scores 2 kills, Su-30 scores 1
            {"kind": "bvr_launch", "side": "ind", "attacker_platform": "rafale_f4", "weapon": "meteor"},
            {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "j20a", "weapon": "meteor"},
            {"kind": "bvr_launch", "side": "ind", "attacker_platform": "rafale_f4", "weapon": "meteor"},
            {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "j20a", "weapon": "meteor"},
            {"kind": "bvr_launch", "side": "ind", "attacker_platform": "su30_mki", "weapon": "r77"},
            {"kind": "kill", "side": "ind", "attacker_platform": "su30_mki", "victim_platform": "j16", "weapon": "r77"},
            # Rafale loses 1
            {"kind": "kill", "side": "adv", "attacker_platform": "j20a", "victim_platform": "rafale_f4"},
        ],
    )
    v2 = _mkv(
        faction="PAF",
        objective_met=False,
        ind_airframes_lost=2,
        adv_airframes_lost=1,
        eligible=[{"squadron_id": 101, "platform_id": "rafale_f4"}],
        committed=[{"squadron_id": 101, "airframes": 4}],
        event_trace=[
            {"kind": "detection", "advantage": "adv"},
            {"kind": "bvr_launch", "side": "ind", "attacker_platform": "rafale_f4", "weapon": "meteor"},
            {"kind": "kill", "side": "adv", "attacker_platform": "j10c", "victim_platform": "rafale_f4"},
            {"kind": "kill", "side": "adv", "attacker_platform": "j10c", "victim_platform": "rafale_f4"},
        ],
    )
    result = compute_performance([v1, v2], platforms_by_id=platforms_by_id, weapons_by_id={})
    # Platforms sorted by sorties desc — Rafale 2, Su-30 1
    assert [p["platform_id"] for p in result["platforms"]] == ["rafale_f4", "su30_mki"]
    rafale = next(p for p in result["platforms"] if p["platform_id"] == "rafale_f4")
    assert rafale["platform_name"] == "Dassault Rafale F4"
    assert rafale["sorties"] == 2
    assert rafale["kills"] == 2
    assert rafale["losses"] == 3
    # kd_ratio = 2 / 3 = 0.67 (rounded to 2 decimals)
    assert rafale["kd_ratio"] == 0.67
    # win_contribution: committed in 2 vignettes, 1 objective_met = 50%
    assert rafale["win_contribution_pct"] == 50
    # first_shot: committed in 2 vignettes, 1 had ind detection advantage = 50%
    assert rafale["first_shot_pct"] == 50
    assert rafale["top_weapon"] == "meteor"

    su30 = next(p for p in result["platforms"] if p["platform_id"] == "su30_mki")
    assert su30["sorties"] == 1
    assert su30["kills"] == 1
    assert su30["losses"] == 0
    # kd_ratio is None when losses == 0 (display as "∞" on the frontend)
    assert su30["kd_ratio"] is None
    assert su30["win_contribution_pct"] == 100
    assert su30["top_weapon"] == "r77"


def test_weapon_stats_compute_hit_rate_cost_per_kill_top_target_avg_pk():
    weapons_by_id = {
        "meteor": {"unit_cost_cr": 18, "class": "a2a_bvr"},
        "r77":    {"unit_cost_cr":  4, "class": "a2a_bvr"},
    }
    v1 = _mkv(
        faction="PLAAF",
        objective_met=True,
        event_trace=[
            {"kind": "bvr_launch", "side": "ind", "weapon": "meteor", "pk": 0.30, "target_platform": "j20a"},
            {"kind": "bvr_launch", "side": "ind", "weapon": "meteor", "pk": 0.10, "target_platform": "j20a"},
            {"kind": "bvr_launch", "side": "ind", "weapon": "meteor", "pk": 0.50, "target_platform": "kj500"},
            {"kind": "kill", "side": "ind", "attacker_platform": "rafale_f4", "victim_platform": "kj500", "weapon": "meteor"},
            {"kind": "bvr_launch", "side": "ind", "weapon": "r77", "pk": 0.00, "target_platform": "j20a"},
            {"kind": "bvr_launch", "side": "ind", "weapon": "r77", "pk": 0.10, "target_platform": "j16"},
            {"kind": "kill", "side": "ind", "attacker_platform": "su30_mki", "victim_platform": "j16", "weapon": "r77"},
        ],
    )
    v1["outcome"]["munitions_expended"] = [
        {"weapon": "meteor", "fired": 3, "hits": 1, "unit_cost_cr": 18, "total_cost_cr": 54},
        {"weapon": "r77",    "fired": 2, "hits": 1, "unit_cost_cr":  4, "total_cost_cr":  8},
    ]
    v1["outcome"]["munitions_cost_total_cr"] = 62

    result = compute_performance([v1], platforms_by_id={}, weapons_by_id=weapons_by_id)
    # Sort: weapons with fired > 0 desc, then weapon_id asc
    assert [w["weapon_id"] for w in result["weapons"]] == ["meteor", "r77"]

    meteor = next(w for w in result["weapons"] if w["weapon_id"] == "meteor")
    assert meteor["fired"] == 3
    assert meteor["hits"] == 1
    # hit_rate = round(1/3 * 100) = 33
    assert meteor["hit_rate_pct"] == 33
    # avg_pk = mean(0.30, 0.10, 0.50) = 0.30 (rounded to 2 decimals)
    assert meteor["avg_pk"] == 0.30
    assert meteor["total_cost_cr"] == 54
    # cost_per_kill = 54 / 1 = 54
    assert meteor["cost_per_kill_cr"] == 54
    assert meteor["top_target_platform"] == "kj500"
    assert meteor["weapon_class"] == "a2a_bvr"

    r77 = next(w for w in result["weapons"] if w["weapon_id"] == "r77")
    assert r77["fired"] == 2
    assert r77["hits"] == 1
    assert r77["cost_per_kill_cr"] == 8
    assert r77["top_target_platform"] == "j16"


def test_weapon_with_fired_but_no_hits_has_null_cost_per_kill():
    weapons_by_id = {"meteor": {"unit_cost_cr": 18, "class": "a2a_bvr"}}
    v = _mkv(event_trace=[
        {"kind": "bvr_launch", "side": "ind", "weapon": "meteor", "pk": 0.0, "target_platform": "j20a"},
    ])
    v["outcome"]["munitions_expended"] = [
        {"weapon": "meteor", "fired": 1, "hits": 0, "unit_cost_cr": 18, "total_cost_cr": 18},
    ]
    v["outcome"]["munitions_cost_total_cr"] = 18

    result = compute_performance([v], platforms_by_id={}, weapons_by_id=weapons_by_id)
    meteor = next(w for w in result["weapons"] if w["weapon_id"] == "meteor")
    assert meteor["hits"] == 0
    assert meteor["hit_rate_pct"] == 0
    assert meteor["cost_per_kill_cr"] is None
    assert meteor["top_target_platform"] is None
