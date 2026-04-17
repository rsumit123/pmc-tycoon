"""Planning module: geography + readiness eligibility for player squadrons.

Pure function compute_eligible_squadrons takes a planning_state (AO
coords), the player's squadrons, and the bases + platforms content
registries, and returns one row per squadron with distance / in_range /
airframes_available / loadout.

Squadrons whose base or platform isn't in the registries are silently
skipped — they shouldn't have been created in the first place, but the
defensive skip avoids crashing the API on orphaned seed data.
"""

from __future__ import annotations

import math

from app.engine.vignette.bvr import PLATFORM_LOADOUTS


EARTH_RADIUS_KM = 6371.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1r, lon1r, lat2r, lon2r = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2r - lat1r
    dlon = lon2r - lon1r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return EARTH_RADIUS_KM * c


def compute_eligible_squadrons(
    planning_state: dict,
    squadrons: list[dict],
    bases_registry: dict[int, dict],
    platforms_registry: dict[str, dict],
) -> list[dict]:
    ao = planning_state["ao"]
    ao_lat, ao_lon = ao["lat"], ao["lon"]
    out: list[dict] = []
    for sq in squadrons:
        base = bases_registry.get(sq["base_id"])
        plat = platforms_registry.get(sq["platform_id"])
        if base is None or plat is None:
            continue
        distance = haversine_km(base["lat"], base["lon"], ao_lat, ao_lon)
        in_range = distance <= plat["combat_radius_km"]
        loadout = list(PLATFORM_LOADOUTS.get(sq["platform_id"], {}).get("bvr", [])) + \
                  list(PLATFORM_LOADOUTS.get(sq["platform_id"], {}).get("wvr", []))
        out.append({
            "squadron_id": sq["id"],
            "name": sq.get("name", ""),
            "platform_id": sq["platform_id"],
            "base_id": sq["base_id"],
            "base_name": base["name"],
            "distance_km": round(distance, 1),
            "in_range": in_range,
            "airframes_available": int(sq["strength"] * sq["readiness_pct"] / 100),
            "readiness_pct": sq["readiness_pct"],
            "xp": sq.get("xp", 0),
            "loadout": loadout,
        })
    return out
