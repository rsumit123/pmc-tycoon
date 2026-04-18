"""Pick the best base to receive a newly delivered platform.

Pure function. Heuristic:
1. If any existing squadron flies this platform, prefer that base (consolidation).
2. Else pick a base whose runway_class is compatible with the platform.
3. Among compatible bases, prefer the one with lowest shelter utilization.

Returns base_id or None if nothing compatible.
"""
from __future__ import annotations


RUNWAY_COMPATIBILITY = {
    "short": {"short", "standard", "long", "medium"},
    "standard": {"standard", "long", "medium"},
    "medium": {"standard", "long", "medium"},
    "long": {"long"},
}


def _platform_runway_req(platform: dict) -> str:
    return platform.get("runway_class", "standard")


def _base_utilization(base_id: int, squadrons: list[dict], shelter_count: int) -> float:
    used = sum(s.get("strength", 0) for s in squadrons if s.get("base_id") == base_id)
    if shelter_count <= 0:
        return float("inf")
    return used / shelter_count


def pick_base_for_delivery(
    platform: dict,
    bases: list[dict],
    squadrons: list[dict],
) -> int | None:
    runway_req = _platform_runway_req(platform)
    acceptable = RUNWAY_COMPATIBILITY.get(runway_req, {"standard", "long", "medium"})
    compatible = [b for b in bases if b.get("runway_class") in acceptable]
    if not compatible:
        return None

    # 1. Consolidation: existing squadron with this platform
    for sq in squadrons:
        if sq.get("platform_id") == platform["id"]:
            base = next((b for b in compatible if b["id"] == sq.get("base_id")), None)
            if base is not None:
                return base["id"]

    # 2. Lowest utilization among compatible
    compatible.sort(key=lambda b: _base_utilization(b["id"], squadrons, b.get("shelter_count", 0)))
    return compatible[0]["id"]
