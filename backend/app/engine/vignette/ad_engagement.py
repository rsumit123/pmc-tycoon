"""AD engagement pre-round.

Before BVR, any friendly AD battery whose coverage bubble covers the AO
rolls engagement PK per adversary airframe. Shot-down airframes are
deducted from the adversary force before the air-to-air resolver runs.

Pure function.
"""
from __future__ import annotations

import math
import random


EARTH_RADIUS_KM = 6371.0


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1r, lon1r, lat2r, lon2r = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2r - lat1r
    dlon = lon2r - lon1r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def resolve_ad_engagement(
    ao: dict,
    batteries: list[dict],
    bases_registry: dict[int, dict],
    ad_specs: dict[str, dict],
    adv_force: list[dict],
    rng: random.Random,
    battery_stock: dict | None = None,
) -> tuple[list[dict], list[dict]]:
    """Return (new_adv_force, trace_events).

    Events shape: {t_min: -5, kind: "ad_engagement", battery_system, base_name,
    target_platform, pk}.

    battery_stock: optional mutable dict {battery_id: current_interceptor_stock}.
    If supplied, each shot decrements by 1 and empty magazines skip the roll.
    If None, behavior is unlimited (legacy / backward compat).
    """
    in_range: list[dict] = []
    for bat in batteries:
        base = bases_registry.get(bat["base_id"])
        if base is None:
            continue
        dist = _haversine_km(base["lat"], base["lon"], ao["lat"], ao["lon"])
        if dist <= bat["coverage_km"]:
            spec = ad_specs.get(bat["system_id"])
            if spec is None:
                continue
            in_range.append({
                "battery": bat, "base_name": base.get("name", ""),
                "max_pk": spec.get("max_pk", 0.0),
                "name": spec.get("name", bat["system_id"]),
            })

    if not in_range:
        return list(adv_force), []

    trace: list[dict] = []
    out: list[dict] = []
    for entry in adv_force:
        count = entry["count"]
        for bat_info in in_range:
            pk = bat_info["max_pk"]
            bid = bat_info["battery"]["id"]
            for _ in range(count):
                if battery_stock is not None:
                    if battery_stock.get(bid, 0) <= 0:
                        break  # magazine empty
                    battery_stock[bid] = battery_stock.get(bid, 0) - 1
                hit = rng.random() < pk
                trace.append({
                    "t_min": -5, "kind": "ad_engagement",
                    "battery_id": bid,
                    "battery_system": bat_info["name"],
                    "base_name": bat_info["base_name"],
                    "target_platform": entry["platform_id"],
                    "pk": round(pk, 2),
                    "hit": hit,
                })
                if hit:
                    count -= 1
        if count > 0:
            new_entry = dict(entry)
            new_entry["count"] = count
            out.append(new_entry)

    return out, trace
