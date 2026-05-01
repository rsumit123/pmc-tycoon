from app.engine.offensive.planning import validate_strike_package, forecast_strike


def _good_package():
    return {
        "profile": "deep_strike",
        "squadrons": [
            {"id": 1, "platform_id": "rafale_f4", "airframes": 6, "role": "multirole",
             "base_id": 5, "loadout": ["meteor", "mica_ir"]},
            {"id": 2, "platform_id": "su30_mki", "airframes": 8, "role": "multirole",
             "base_id": 5, "loadout": ["r77", "r73"]},
        ],
        "weapons_planned": {"meteor": 12, "r77": 16},
        "support": {"awacs": True, "tanker": False},
        "roe": "unrestricted",
    }


def test_valid_package():
    pkg = _good_package()
    target = {"id": 99, "shelter_count": 24, "ad_destroyed": False}
    issues = validate_strike_package(pkg, target, weapons_avail={"meteor": 50, "r77": 80})
    assert issues == []


def test_too_few_squadrons():
    pkg = _good_package()
    pkg["squadrons"] = pkg["squadrons"][:1]
    issues = validate_strike_package(pkg, {"id": 1, "shelter_count": 12, "ad_destroyed": False},
                                      weapons_avail={"meteor": 50})
    assert any("at least 2 squadrons" in i.lower() for i in issues)


def test_insufficient_weapons():
    pkg = _good_package()
    pkg["weapons_planned"] = {"meteor": 80}
    issues = validate_strike_package(pkg, {"id": 1, "shelter_count": 12, "ad_destroyed": False},
                                      weapons_avail={"meteor": 20})
    assert any("insufficient meteor" in i.lower() for i in issues)


def test_forecast_ranges_widen_with_low_intel_quality():
    pkg = _good_package()
    target = {"id": 99, "shelter_count": 24, "ad_destroyed": False, "ad_battery_count": 1}
    high = forecast_strike(pkg, target, intel_quality="high")
    low = forecast_strike(pkg, target, intel_quality="low")
    assert (high["ind_losses"][1] - high["ind_losses"][0]) <= (low["ind_losses"][1] - low["ind_losses"][0])
    assert (high["damage_pct"][1] - high["damage_pct"][0]) <= (low["damage_pct"][1] - low["damage_pct"][0])


def test_forecast_returns_blowback_score():
    pkg = _good_package()
    target = {"id": 99, "shelter_count": 24, "ad_destroyed": False, "ad_battery_count": 1, "command_node": True}
    fc = forecast_strike(pkg, target, intel_quality="medium")
    assert fc["diplomatic_blowback"] in {"low", "medium", "high", "critical"}
