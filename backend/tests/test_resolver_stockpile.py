"""Resolver respects per-base missile stock: empty depot -> no shot fired."""
from app.engine.vignette.resolver import resolve


def _ps_with_limited_stock():
    return {
        "scenario_id": "test",
        "scenario_name": "Test",
        "ao": {"region": "test", "name": "t", "lat": 28.0, "lon": 77.0},
        "response_clock_minutes": 30,
        "adversary_force": [
            {"role": "CAP", "faction": "PLAAF",
             "platform_id": "j16", "count": 3, "loadout": ["pl15"]},
        ],
        "eligible_squadrons": [{
            "squadron_id": 101, "name": "17 Sqn", "platform_id": "rafale_f4",
            "base_id": 1, "base_name": "Test Base", "distance_km": 200.0,
            "in_range": True, "range_tier": "A",
            "airframes_available": 4, "readiness_pct": 80, "xp": 0,
            "loadout": ["meteor", "mica_ir"],
        }],
        "allowed_ind_roles": ["interceptor"],
        "roe_options": ["weapons_free"],
        "objective": {"kind": "defend_airspace", "success_threshold": {}},
        "missile_stock": {
            # base 1 has only 2 Meteor and 0 MICA-IR — resolver should fire
            # at most 2 Meteor and 0 MICA-IR across all rounds.
            (1, "meteor"): 2,
            (1, "mica_ir"): 0,
        },
    }


def test_resolver_respects_missile_stock():
    ps = _ps_with_limited_stock()
    cf = {
        "squadrons": [{"squadron_id": 101, "airframes": 4}],
        "support": {"awacs": False, "tanker": False, "sead_package": False},
        "roe": "weapons_free",
    }
    platforms = {
        "rafale_f4": {"combat_radius_km": 1000, "generation": "4.5",
                      "radar_range_km": 220, "rcs_band": "reduced"},
        "j16": {"combat_radius_km": 1000, "generation": "4.5",
                "radar_range_km": 180, "rcs_band": "conventional"},
    }
    outcome, trace = resolve(ps, cf, platforms, seed=42, year=2026, quarter=2)

    # Count IND bvr/wvr launches in trace
    ind_launches = [
        e for e in trace
        if e.get("kind") in ("bvr_launch", "wvr_launch")
        and e.get("side") == "ind"
    ]
    launches_by_weapon: dict[str, int] = {}
    for e in ind_launches:
        launches_by_weapon[e["weapon"]] = launches_by_weapon.get(e["weapon"], 0) + 1
    # At most 2 Meteor launches (stock limit), 0 MICA-IR launches
    assert launches_by_weapon.get("meteor", 0) <= 2
    assert launches_by_weapon.get("mica_ir", 0) == 0

    # Final stock reporting present in outcome
    assert "missile_stock_consumed" in outcome
    assert outcome["missile_stock_consumed"].get("meteor", 0) == launches_by_weapon.get("meteor", 0)
    assert outcome["missile_stock_consumed"].get("mica_ir", 0) == 0

    # Remaining should match initial - consumed
    remaining = outcome.get("missile_stock_remaining", {})
    assert remaining.get((1, "meteor"), 0) == 2 - launches_by_weapon.get("meteor", 0)
    assert remaining.get((1, "mica_ir"), 0) == 0


def test_resolver_no_stock_dict_behaves_as_unlimited():
    """Legacy callers pass no missile_stock — resolver must not gate shots."""
    ps = _ps_with_limited_stock()
    ps.pop("missile_stock")
    cf = {
        "squadrons": [{"squadron_id": 101, "airframes": 4}],
        "support": {"awacs": False, "tanker": False, "sead_package": False},
        "roe": "weapons_free",
    }
    platforms = {
        "rafale_f4": {"combat_radius_km": 1000, "generation": "4.5",
                      "radar_range_km": 220, "rcs_band": "reduced"},
        "j16": {"combat_radius_km": 1000, "generation": "4.5",
                "radar_range_km": 180, "rcs_band": "conventional"},
    }
    outcome, trace = resolve(ps, cf, platforms, seed=42, year=2026, quarter=2)
    ind_launches = [
        e for e in trace
        if e.get("kind") in ("bvr_launch", "wvr_launch")
        and e.get("side") == "ind"
    ]
    # With no stock gating, IND force of 4 airframes should launch well more than 2
    assert len(ind_launches) > 2
    # Consumed dict exists but is empty (no stock supplied)
    assert outcome.get("missile_stock_consumed") == {}
