import random

from app.engine.offensive.penetration import resolve_penetration
from app.engine.offensive.strike_phase import resolve_strike_phase
from app.engine.offensive.egress import resolve_egress
from app.engine.offensive.resolver import resolve_strike


def _pkg():
    return {
        "profile": "deep_strike",
        "squadrons": [
            {"id": 1, "platform_id": "rafale_f4", "airframes": 6, "role": "multirole",
             "rcs_band": "reduced", "loadout": ["meteor", "mica_ir"]},
        ],
        "support": {"awacs": True, "tanker": False},
    }


# --- penetration ---------------------------------------------------------

def test_penetration_no_ad_no_losses():
    target = {"shelter_count": 12, "ad_battery_count": 0, "ad_destroyed": True}
    rng = random.Random(1)
    result = resolve_penetration(_pkg(), target, rng=rng)
    assert result["airframes_lost"] == 0
    assert result["ad_engaged"] is False


def test_penetration_ad_engages():
    target = {"shelter_count": 12, "ad_battery_count": 2, "ad_destroyed": False}
    rng = random.Random(1)
    result = resolve_penetration(_pkg(), target, rng=rng)
    assert result["ad_engaged"] is True


def test_standoff_cruise_skips_penetration():
    pkg = {**_pkg(), "profile": "standoff_cruise"}
    target = {"shelter_count": 12, "ad_battery_count": 5, "ad_destroyed": False}
    rng = random.Random(1)
    result = resolve_penetration(pkg, target, rng=rng)
    assert result["airframes_lost"] == 0
    assert result["skipped"] is True


# --- strike phase --------------------------------------------------------

def test_strike_phase_zero_airframes_zero_damage():
    target = {"shelter_count": 24, "ad_battery_count": 1, "ad_destroyed": False,
              "garrisoned_platforms": ["f16_blk52"], "garrisoned_count": 16}
    pkg = {"profile": "deep_strike", "squadrons": [{"airframes": 0, "loadout": []}],
           "weapons_planned": {}}
    rng = random.Random(1)
    out = resolve_strike_phase(pkg, target, surviving_airframes=0, rng=rng)
    assert out["damage"]["shelter_loss_pct"] == 0
    assert out["damage"]["garrisoned_loss"] == 0
    assert out["weapons_consumed"] == {}


def test_sead_destroys_ad_battery_at_threshold():
    target = {"shelter_count": 12, "ad_battery_count": 1, "ad_destroyed": False,
              "garrisoned_platforms": [], "garrisoned_count": 0}
    pkg = {"profile": "sead_suppression",
           "squadrons": [{"airframes": 4, "loadout": ["rudram_2"]}],
           "weapons_planned": {"rudram_2": 8}}
    rng = random.Random(2)
    out = resolve_strike_phase(pkg, target, surviving_airframes=4, rng=rng)
    assert out["damage"]["ad_destroyed"] is True


def test_runway_disabled_when_kinetic_threshold_hit():
    target = {"shelter_count": 24, "ad_battery_count": 0, "ad_destroyed": True,
              "garrisoned_platforms": ["f16_blk52"], "garrisoned_count": 12}
    pkg = {"profile": "standoff_cruise",
           "squadrons": [{"airframes": 0, "loadout": []}],
           "weapons_planned": {"brahmos_ng": 24}}
    rng = random.Random(7)
    out = resolve_strike_phase(pkg, target, surviving_airframes=24, rng=rng)
    assert out["damage"]["runway_disabled_quarters_remaining"] >= 1


# --- egress --------------------------------------------------------------

def test_egress_skipped_when_no_airframes_left():
    rng = random.Random(1)
    res = resolve_egress(_pkg(), surviving_airframes=0, rng=rng)
    assert res["airframes_lost"] == 0


# --- top-level resolver --------------------------------------------------

def _scene():
    return {
        "package": {
            "profile": "deep_strike",
            "squadrons": [
                {"id": 1, "platform_id": "rafale_f4", "airframes": 6, "role": "multirole",
                 "rcs_band": "reduced", "loadout": ["meteor", "mica_ir"], "base_id": 5},
                {"id": 2, "platform_id": "su30_mki", "airframes": 8, "role": "multirole",
                 "rcs_band": "conventional", "loadout": ["r77"], "base_id": 5},
            ],
            "weapons_planned": {"meteor": 16, "r77": 16, "saaw": 24},
            "support": {"awacs": True, "tanker": True},
            "roe": "unrestricted",
        },
        "target": {"id": 99, "shelter_count": 24, "ad_battery_count": 1,
                   "ad_destroyed": False, "garrisoned_platforms": ["f16_blk52"],
                   "garrisoned_count": 16, "command_node": True, "value": 5},
    }


def test_resolve_strike_returns_full_outcome():
    s = _scene()
    rng = random.Random(42)
    result = resolve_strike(s["package"], s["target"], rng=rng)
    assert "damage" in result
    assert "ind_airframes_lost" in result
    assert "weapons_consumed" in result
    assert any(ev.get("phase") == "penetration" for ev in result["events"])
    assert any(ev.get("phase") == "strike" for ev in result["events"])
    assert any(ev.get("phase") == "egress" for ev in result["events"])


def test_resolve_strike_deterministic_with_seed():
    s = _scene()
    a = resolve_strike(s["package"], s["target"], rng=random.Random(42))
    b = resolve_strike(s["package"], s["target"], rng=random.Random(42))
    assert a == b
