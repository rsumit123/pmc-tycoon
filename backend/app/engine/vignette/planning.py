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

# Weapons with enough seeker / range to engage low-RCS (5-gen) targets with
# non-negligible PK. Used for the "ineffective loadout" warning on the
# Force Committer.
STEALTH_EFFECTIVE_WEAPONS: frozenset[str] = frozenset({
    "meteor", "astra_mk2", "astra_mk3",
    "pl15", "pl17",
    "aim120d", "aim9x",
})

# Tanker-extended combat radius multiplier. Squadrons beyond base
# combat_radius_km but within this multiple can be committed IF tanker
# support is selected. Beyond this, the sortie is unrealistic (multi-hop
# ferry) and the UI hard-disables them.
TANKER_RANGE_MULT = 2.0


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
        combat_radius = plat["combat_radius_km"]
        in_range = distance <= combat_radius
        tanker_range = combat_radius * TANKER_RANGE_MULT
        if in_range:
            range_tier = "A"
        elif distance <= tanker_range:
            range_tier = "B"
        else:
            range_tier = "C"
        override = sq.get("loadout_override_json")
        if override:
            loadout = list(override)
        else:
            loadout = list(PLATFORM_LOADOUTS.get(sq["platform_id"], {}).get("bvr", [])) + \
                      list(PLATFORM_LOADOUTS.get(sq["platform_id"], {}).get("wvr", []))
        loadout_stealth_effective = any(w in STEALTH_EFFECTIVE_WEAPONS for w in loadout)
        out.append({
            "squadron_id": sq["id"],
            "name": sq.get("name", ""),
            "platform_id": sq["platform_id"],
            "base_id": sq["base_id"],
            "base_name": base["name"],
            "distance_km": round(distance, 1),
            "in_range": in_range,
            "range_tier": range_tier,
            "requires_tanker": range_tier == "B",
            "loadout_stealth_effective": loadout_stealth_effective,
            "airframes_available": int(sq["strength"] * sq["readiness_pct"] / 100),
            "readiness_pct": sq["readiness_pct"],
            "xp": sq.get("xp", 0),
            "loadout": loadout,
        })
    return out
