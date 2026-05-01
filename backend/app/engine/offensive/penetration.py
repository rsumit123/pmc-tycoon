"""Penetration phase: getting in past adversary AD + AWACS detection."""
from __future__ import annotations
import random
from typing import Any
from app.content.registry import strike_profiles

_AD_BATTERY_HIT_PROB = 0.06
_RCS_MULT = {"VLO": 0.25, "LO": 0.45, "reduced": 0.7, "conventional": 1.0, "large": 1.3}


def resolve_penetration(
    package: dict[str, Any],
    target: dict[str, Any],
    *,
    rng: random.Random,
) -> dict[str, Any]:
    profile = strike_profiles()[package["profile"]]
    events: list[dict[str, Any]] = []

    if profile.detection_modifier == 0.0 or profile.id == "standoff_cruise":
        events.append({"phase": "penetration", "type": "skipped",
                       "note": "stand-off launch, no penetration"})
        return {"airframes_lost": 0, "ad_engaged": False, "skipped": True, "events": events}

    if target.get("ad_destroyed") or target.get("ad_battery_count", 0) == 0:
        events.append({"phase": "penetration", "type": "no_ad", "note": "no active AD"})
        return {"airframes_lost": 0, "ad_engaged": False, "skipped": False, "events": events}

    losses = 0
    ad_count = target["ad_battery_count"]
    for sq in package.get("squadrons", []):
        rcs_mult = _RCS_MULT.get(sq.get("rcs_band", "conventional"), 1.0)
        airframes = sq.get("airframes", 0)
        for _ in range(ad_count):
            for _ in range(airframes):
                if rng.random() < _AD_BATTERY_HIT_PROB * rcs_mult * profile.detection_modifier:
                    losses += 1
                    if losses >= airframes:
                        break
            if losses >= airframes:
                break
    events.append({"phase": "penetration", "type": "ad_engagement",
                   "ad_battery_count": ad_count, "airframes_lost": losses})
    return {"airframes_lost": losses, "ad_engaged": True, "skipped": False, "events": events}
