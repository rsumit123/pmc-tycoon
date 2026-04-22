"""Pure-function ISR drone recon pass.

Each quarter during advance_turn, friendly ISR drones passively surveil
adversary airbases. Coverage is per-platform (Tapas 300 km, Ghatak 500 km,
Heron TP 1000 km, MQ-9B 1800 km). Observation fidelity is tiered by platform
(low/medium/high); overlapping coverage of the same tier upgrades one step.

Side effects live outside this module — the caller persists sightings as
IntelCard rows.
"""
from __future__ import annotations

import math
import random
from typing import Any

from app.engine.vignette.awacs_coverage import (
    ISR_DRONE_PLATFORM_IDS,
    ISR_ORBIT_RADIUS_KM_BY_PLATFORM,
    ISR_FIDELITY_TIER,
)

EARTH_RADIUS_KM = 6371.0
TIER_RANK = {"low": 1, "medium": 2, "high": 3}


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1r, lon1r, lat2r, lon2r = map(math.radians, (lat1, lon1, lat2, lon2))
    dlat = lat2r - lat1r
    dlon = lon2r - lon1r
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1r) * math.cos(lat2r) * math.sin(dlon / 2) ** 2
    return EARTH_RADIUS_KM * 2 * math.asin(math.sqrt(a))


def _upgrade_tier_on_overlap(tiers: list[str]) -> str:
    """Overlapping coverage of the same tier upgrades one step.

    low + low → medium; medium + medium → high. A single high drone stays
    high. Mixed tiers use the highest available.
    """
    best = max(tiers, key=lambda t: TIER_RANK[t])
    same_tier_count = sum(1 for t in tiers if t == best)
    if best == "high":
        return "high"
    if best == "medium" and same_tier_count >= 2:
        return "high"
    if best == "low" and same_tier_count >= 2:
        return "medium"
    return best


def bases_covered_by_drones(
    adversary_bases: list[dict[str, Any]],
    drone_squadrons: list[dict[str, Any]],
    friendly_bases_registry: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    """Return per-adversary-base coverage records.

    Each record includes the list of covering friendly drones and the
    effective tier after overlap upgrade. Uncovered bases are omitted.
    """
    active_drones = [
        sq for sq in drone_squadrons
        if sq.get("platform_id") in ISR_DRONE_PLATFORM_IDS
        and sq.get("strength", 0) > 0
        and sq.get("readiness_pct", 0) > 0
    ]

    out: list[dict[str, Any]] = []
    for adv in adversary_bases:
        covering: list[dict[str, Any]] = []
        for sq in active_drones:
            fb = friendly_bases_registry.get(sq["base_id"])
            if fb is None:
                continue
            radius = ISR_ORBIT_RADIUS_KM_BY_PLATFORM.get(sq["platform_id"], 700)
            dist = _haversine_km(fb["lat"], fb["lon"], adv["lat"], adv["lon"])
            if dist > radius:
                continue
            covering.append({
                "squadron_id": sq["id"],
                "platform_id": sq["platform_id"],
                "from_base_id": sq["base_id"],
                "from_base_name": fb.get("name", ""),
                "distance_km": round(dist, 1),
                "tier": ISR_FIDELITY_TIER[sq["platform_id"]],
            })
        if not covering:
            continue
        effective_tier = _upgrade_tier_on_overlap([c["tier"] for c in covering])
        out.append({
            "adversary_base_id": adv["id"],
            "base_id_str": adv["base_id_str"],
            "faction": adv["faction"],
            "tier": adv["tier"],
            "home_platforms": tuple(adv.get("home_platforms", ())),
            "effective_tier": effective_tier,
            "covering_drones": covering,
        })
    return out


def _count_range(true_count: int, jitter_pct: float, rng: random.Random) -> list[int]:
    lo_jitter = rng.uniform(-jitter_pct, 0)
    hi_jitter = rng.uniform(0, jitter_pct)
    lo = max(0, int(true_count * (1 + lo_jitter)))
    hi = max(lo, int(true_count * (1 + hi_jitter)))
    return [lo, hi]


def _partition_faction_force_to_base(
    faction_inventory: dict[str, int],
    home_platforms: tuple[str, ...] | list[str],
) -> dict[str, int]:
    """Assign a rough per-base slice of faction-wide inventory.

    Simple deterministic heuristic: each home platform gets ~1/3 of its
    faction-wide count, capped by availability. This doesn't have to match
    adversary ground-truth exactly — drone recon is fuzzy by design and the
    caller adds jitter on top.
    """
    per_base: dict[str, int] = {}
    for pid in home_platforms:
        total = faction_inventory.get(pid, 0)
        per_base[pid] = max(0, total // 3)
    return per_base


def synth_observed_force(
    base_true_force: dict[str, int],
    home_platforms: tuple[str, ...] | list[str],
    tier: str,
    rng: random.Random,
) -> dict[str, Any]:
    """Synthesize an observation payload from true force + fidelity tier."""
    total_true = sum(base_true_force.values())
    if tier == "low":
        return {
            "tier": "low",
            "count_range": _count_range(total_true, jitter_pct=0.35, rng=rng),
        }
    if tier == "medium":
        return {
            "tier": "medium",
            "count_range": _count_range(total_true, jitter_pct=0.15, rng=rng),
            "platforms": list(home_platforms),
        }
    # high — exact counts + readiness
    readiness = rng.choice(["low", "medium", "medium", "high"])  # weighted medium
    return {
        "tier": "high",
        "total": total_true,
        "platforms_detailed": dict(base_true_force),
        "readiness": readiness,
    }


def generate_drone_sightings(
    adversary_bases: list[dict[str, Any]],
    drone_squadrons: list[dict[str, Any]],
    friendly_bases_registry: dict[int, dict[str, Any]],
    adversary_force_by_faction: dict[str, dict[str, int]],
    year: int,
    quarter: int,
    rng: random.Random,
) -> list[dict[str, Any]]:
    """Build one IntelCard-shaped dict per covered adversary base.

    Schema returned matches what crud.campaign.advance_turn writes into the
    IntelCard table (source_type + payload); no 'subject_id' column exists
    in the ORM so that field rides inside payload.
    """
    covered = bases_covered_by_drones(adversary_bases, drone_squadrons, friendly_bases_registry)
    cards: list[dict[str, Any]] = []
    for cov in covered:
        faction_inv = adversary_force_by_faction.get(cov["faction"], {})
        base_true = _partition_faction_force_to_base(faction_inv, cov["home_platforms"])
        observed = synth_observed_force(
            base_true_force=base_true,
            home_platforms=cov["home_platforms"],
            tier=cov["effective_tier"],
            rng=rng,
        )
        drone_summary = [
            f"{d['platform_id']}@{d['from_base_name'] or d['from_base_id']}"
            for d in cov["covering_drones"]
        ]
        payload = {
            "subject_kind": "adversary_base",
            "subject_id": cov["base_id_str"],
            "faction": cov["faction"],
            "observed_force": observed,
            "covering_drones": drone_summary,
            "headline": f"ISR recon: {cov['faction']} base — {cov['effective_tier']} fidelity",
        }
        cards.append({
            "source_type": "drone_recon",
            "confidence": {"low": 0.4, "medium": 0.7, "high": 0.9}[cov["effective_tier"]],
            "truth_value": True,  # drone recon is truthful, just fuzzy
            "payload": payload,
        })
    return cards
