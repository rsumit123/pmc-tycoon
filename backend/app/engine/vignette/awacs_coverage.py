"""Compute which AWACS squadrons can orbit-cover a given AO.

Pure function. An AWACS squadron covers the AO if:
- Its platform has role 'awacs' (by id allowlist for simplicity — netra_aewc,
  phalcon_a50 when added)
- The squadron has readiness_pct > 0 and strength > 0
- The great-circle distance from its base to the AO ≤ orbit_radius_km

Returns a list of {squadron_id, base_id, base_name, distance_km, strength,
readiness_pct}.
"""
from __future__ import annotations

import math

EARTH_RADIUS_KM = 6371.0

# Known IAF AWACS platform ids. Keep in sync with platforms.yaml.
AWACS_PLATFORM_IDS: set[str] = {"netra_aewc", "phalcon_a50"}

# Known IAF ISR/drone platform ids. Keep in sync with platforms.yaml.
ISR_DRONE_PLATFORM_IDS: set[str] = {"tapas_uav", "ghatak_ucav", "mq9b_seaguardian", "heron_tp"}
ISR_ORBIT_RADIUS_KM = 700


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1r, lon1r, lat2r, lon2r = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2r - lat1r
    dlon = lon2r - lon1r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def awacs_covering(
    ao: dict,
    squadrons: list[dict],
    bases_registry: dict[int, dict],
    awacs_orbit_radius_km: int = 1000,
) -> list[dict]:
    out: list[dict] = []
    for sq in squadrons:
        if sq.get("platform_id") not in AWACS_PLATFORM_IDS:
            continue
        if sq.get("readiness_pct", 0) <= 0 or sq.get("strength", 0) <= 0:
            continue
        base = bases_registry.get(sq["base_id"])
        if base is None:
            continue
        dist = _haversine_km(base["lat"], base["lon"], ao["lat"], ao["lon"])
        if dist > awacs_orbit_radius_km:
            continue
        out.append({
            "squadron_id": sq["id"],
            "base_id": sq["base_id"],
            "base_name": base.get("name", ""),
            "distance_km": round(dist, 1),
            "strength": sq["strength"],
            "readiness_pct": sq["readiness_pct"],
        })
    return out


def isr_drone_covering(
    ao: dict,
    squadrons: list[dict],
    bases_registry: dict[int, dict],
    orbit_radius_km: int = ISR_ORBIT_RADIUS_KM,
) -> list[dict]:
    out: list[dict] = []
    for sq in squadrons:
        if sq.get("platform_id") not in ISR_DRONE_PLATFORM_IDS:
            continue
        if sq.get("readiness_pct", 0) <= 0 or sq.get("strength", 0) <= 0:
            continue
        base = bases_registry.get(sq["base_id"])
        if base is None:
            continue
        dist = _haversine_km(base["lat"], base["lon"], ao["lat"], ao["lon"])
        if dist > orbit_radius_km:
            continue
        out.append({
            "squadron_id": sq["id"],
            "base_id": sq["base_id"],
            "base_name": base.get("name", ""),
            "distance_km": round(dist, 1),
            "strength": sq["strength"],
            "readiness_pct": sq["readiness_pct"],
            "platform_id": sq["platform_id"],
        })
    return out
