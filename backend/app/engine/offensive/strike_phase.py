"""Strike phase: weapons-on-target P_kill rolls + BDA allocation.

Output `damage` dict matches BaseDamage ORM fields, ready for upsert
into the BaseDamage row by the caller.
"""
from __future__ import annotations
import random
from typing import Any
from app.content.registry import strike_profiles
from app.engine.vignette.bvr import WEAPONS

_CLASS_PK = {
    "anti_radiation": 0.55,
    "land_attack":    0.65,
    "anti_ship":      0.50,
    "glide_bomb":     0.45,
}

_LANDED_SHELTER_PCT = 4
_LANDED_GARRISON_PER = 1
_LANDED_RUNWAY_THRESHOLD = 6
_LANDED_AD_THRESHOLD = 4

_SHELTER_CAP_PCT = 80
_GARRISON_CAP_FRAC = 0.60


def resolve_strike_phase(
    package: dict[str, Any],
    target: dict[str, Any],
    *,
    surviving_airframes: int,
    rng: random.Random,
) -> dict[str, Any]:
    profile = strike_profiles()[package["profile"]]
    weapons_planned = dict(package.get("weapons_planned", {}))
    weapons_consumed: dict[str, int] = {}
    landed_by_class: dict[str, int] = {}

    if profile.id == "standoff_cruise":
        # Cruise/standoff launches even without surviving airframes.
        for wid, qty in weapons_planned.items():
            wclass = WEAPONS.get(wid, {}).get("class", "land_attack")
            landed = int(round(qty * _CLASS_PK.get(wclass, 0.5) * profile.pk_modifier))
            weapons_consumed[wid] = qty
            landed_by_class[wclass] = landed_by_class.get(wclass, 0) + landed
    elif surviving_airframes > 0:
        package_size = sum(sq.get("airframes", 0) for sq in package.get("squadrons", []))
        survive_frac = surviving_airframes / max(1, package_size)
        for wid, qty in weapons_planned.items():
            scaled = int(round(qty * survive_frac))
            wclass = WEAPONS.get(wid, {}).get("class", "land_attack")
            landed = int(round(scaled * _CLASS_PK.get(wclass, 0.5) * profile.pk_modifier))
            weapons_consumed[wid] = scaled
            landed_by_class[wclass] = landed_by_class.get(wclass, 0) + landed

    shelter_loss_pct = 0
    garrisoned_loss = 0
    ad_destroyed = bool(target.get("ad_destroyed", False))
    runway_disabled_q = 0

    landed_arm = landed_by_class.get("anti_radiation", 0)
    if landed_arm >= _LANDED_AD_THRESHOLD and not ad_destroyed and target.get("ad_battery_count", 0) > 0:
        ad_destroyed = True

    landed_kinetic = (
        landed_by_class.get("land_attack", 0)
        + landed_by_class.get("anti_ship", 0)
        + landed_by_class.get("glide_bomb", 0)
    )
    if landed_kinetic > 0:
        shelter_loss_pct = min(_SHELTER_CAP_PCT, landed_kinetic * _LANDED_SHELTER_PCT)
        garrison_total = target.get("garrisoned_count", 0)
        garrisoned_loss = min(int(garrison_total * _GARRISON_CAP_FRAC),
                               landed_kinetic * _LANDED_GARRISON_PER)
        if landed_kinetic >= _LANDED_RUNWAY_THRESHOLD:
            runway_disabled_q = 1 + (landed_kinetic // (_LANDED_RUNWAY_THRESHOLD * 2))

    return {
        "damage": {
            "shelter_loss_pct": shelter_loss_pct,
            "runway_disabled_quarters_remaining": runway_disabled_q,
            "ad_destroyed": ad_destroyed,
            "garrisoned_loss": garrisoned_loss,
        },
        "landed_by_class": landed_by_class,
        "weapons_consumed": weapons_consumed,
    }
