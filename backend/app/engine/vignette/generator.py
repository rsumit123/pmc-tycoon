"""Scenario picker + procedural planning-state builder.

pick_scenario filters eligible templates (quarter window + inventory
gates + active-system gates) and draws a weighted choice.

build_planning_state takes a picked template and the current adversary
state, materializes the adversary roster (faction inventory -> platform
choice + count in range + loadout), and returns a planning_state dict
ready to persist on a Vignette row.
"""

from __future__ import annotations

import random
from typing import Any

from app.content.loader import ScenarioTemplate
from app.engine.vignette.bvr import PLATFORM_LOADOUTS
from app.engine.vignette.awacs_coverage import awacs_covering as _awacs_covering, isr_drone_covering as _isr_covering
from app.engine.vignette.intel_quality import score_intel_quality

ROLE_FITNESS: dict[str, dict[str, float]] = {
    "CAP":    {"VLO": 4.0, "LO": 2.5, "reduced": 1.5, "conventional": 1.0, "large": 0.3},
    "SEAD":   {"VLO": 2.0, "LO": 1.5, "reduced": 1.5, "conventional": 1.0, "large": 0.5},
    "strike": {"VLO": 1.0, "LO": 1.0, "reduced": 1.0, "conventional": 1.0, "large": 6.0},
    "escort": {"VLO": 3.0, "LO": 2.0, "reduced": 1.5, "conventional": 1.0, "large": 0.3},
}


def _platform_rcs(platform_id: str) -> str:
    from app.content.registry import platforms as platforms_reg
    plats = platforms_reg()
    p = plats.get(platform_id)
    return p.rcs_band if p else "conventional"


def _q_index(year: int, quarter: int) -> int:
    return (year - 2026) * 4 + (quarter - 2)


def is_template_eligible(
    template: ScenarioTemplate,
    adversary_states: dict[str, dict],
    year: int,
    quarter: int,
) -> bool:
    q_idx = _q_index(year, quarter)
    if q_idx < template.q_index_min or q_idx > template.q_index_max:
        return False

    inv_req = template.requires.get("adversary_inventory") or {}
    for faction, units in inv_req.items():
        state = adversary_states.get(faction, {})
        inv = state.get("inventory", {})
        for unit, threshold in units.items():
            if inv.get(unit, 0) < threshold:
                return False

    sys_req = template.requires.get("adversary_active_system")
    if sys_req:
        factions_with_system = any(
            sys_req in s.get("active_systems", [])
            for s in adversary_states.values()
        )
        if not factions_with_system:
            return False

    return True


def pick_scenario(
    templates: list[ScenarioTemplate],
    adversary_states: dict[str, dict],
    year: int,
    quarter: int,
    rng: random.Random,
) -> ScenarioTemplate | None:
    eligible = [
        t for t in templates
        if is_template_eligible(t, adversary_states, year, quarter)
    ]
    if not eligible:
        return None
    weights = [t.weight for t in eligible]
    return rng.choices(eligible, weights=weights, k=1)[0]


def _resolve_ao(
    template: ScenarioTemplate,
    bases_registry: dict,
    rng: random.Random,
) -> dict:
    """If template has ao_base_candidates, pick one friendly base's coords with
    ±5 km jitter (~0.045°). Otherwise return template.ao as-is. Falls back to
    template.ao (or a default) when none of the candidate base template_ids
    are seeded in this campaign."""
    candidates = getattr(template, "ao_base_candidates", None) or ()
    if not candidates:
        return dict(template.ao) if template.ao else {
            "region": "unknown", "name": "unknown", "lat": 28.0, "lon": 77.0,
        }
    by_tpl = {b.get("template_id"): b for b in bases_registry.values() if b.get("template_id")}
    picks = [by_tpl[t] for t in candidates if t in by_tpl]
    if not picks:
        if template.ao:
            return dict(template.ao)
        return {"region": "unknown", "name": "unknown", "lat": 28.0, "lon": 77.0}
    picked = rng.choice(picks)
    lat_jitter = (rng.random() - 0.5) * 0.09
    lon_jitter = (rng.random() - 0.5) * 0.09
    return {
        "region": picked.get("region", "airbase"),
        "name": f"{picked.get('name', picked.get('template_id', ''))} vicinity",
        "lat": round(picked["lat"] + lat_jitter, 4),
        "lon": round(picked["lon"] + lon_jitter, 4),
    }


def build_planning_state(
    template: ScenarioTemplate,
    adversary_states: dict[str, dict],
    rng: random.Random,
    player_squadrons: list[dict] | None = None,
    bases_registry: dict[int, dict] | None = None,
    recent_intel_confidences: list[float] | None = None,
    ad_batteries: list[dict] | None = None,
    ad_specs: dict[str, dict] | None = None,
) -> dict[str, Any]:
    adv_force: list[dict] = []
    for entry in template.adversary_roster:
        faction = entry["faction"]
        inv = adversary_states.get(faction, {}).get("inventory", {})
        # Filter pool to platforms the faction actually has
        pool = [p for p in entry["platform_pool"] if inv.get(p, 0) > 0]
        if not pool:
            continue
        # Weighted pick by inventory count × role fitness
        role = entry["role"]
        fitness_map = ROLE_FITNESS.get(role, {})
        weights = []
        for p in pool:
            inv_w = inv[p]
            rcs = _platform_rcs(p)
            fitness = fitness_map.get(rcs, 1.0)
            weights.append(inv_w * fitness)
        platform = rng.choices(pool, weights=weights, k=1)[0]
        lo, hi = entry["count_range"]
        count = rng.randint(lo, hi)
        if count <= 0:
            continue
        loadout = list(PLATFORM_LOADOUTS.get(platform, {}).get("bvr", [])) + \
                  list(PLATFORM_LOADOUTS.get(platform, {}).get("wvr", []))
        adv_force.append({
            "role": entry["role"],
            "faction": faction,
            "platform_id": platform,
            "count": count,
            "loadout": loadout,
        })

    player_squadrons = player_squadrons or []
    bases_registry = bases_registry or {}
    recent_intel_confidences = recent_intel_confidences or []

    ao_dict = _resolve_ao(template, bases_registry, rng)
    awacs = _awacs_covering(ao_dict, player_squadrons, bases_registry)
    isr = _isr_covering(ao_dict, player_squadrons, bases_registry)

    # Adversary stealth fraction (VLO + LO platforms)
    stealth_count = sum(
        e["count"] for e in adv_force
        if _platform_rcs(e["platform_id"]) in ("VLO", "LO")
    )
    total = sum(e["count"] for e in adv_force) or 1
    stealth_fraction = stealth_count / total

    quality = score_intel_quality(
        awacs_covering_count=len(awacs),
        recent_intel_confidences=recent_intel_confidences,
        adversary_stealth_fraction=stealth_fraction,
        isr_drones_covering_count=len(isr),
    )

    adv_force_observed = _build_observed(adv_force, quality)

    return {
        "scenario_id": template.id,
        "scenario_name": template.name,
        "ao": ao_dict,
        "response_clock_minutes": template.response_clock_minutes,
        "adversary_force": adv_force,
        "adversary_force_observed": adv_force_observed,
        "intel_quality": quality,
        "awacs_covering": awacs,
        "isr_covering": isr,
        "eligible_squadrons": [],  # planning.py fills this in
        "allowed_ind_roles": list(template.allowed_ind_roles),
        "roe_options": list(template.roe_options),
        "objective": dict(template.objective),
        "ad_batteries": ad_batteries or [],
        "ad_specs": ad_specs or {},
        "bases_registry": bases_registry or {},
        "allows_no_cap": bool(getattr(template, "allows_no_cap", False)),
    }


def _build_observed(adv_force: list[dict], quality: dict) -> list[dict]:
    """Return the fogged view of the adversary force for display."""
    tier = quality["tier"]
    total = sum(e["count"] for e in adv_force)

    if tier == "perfect":
        return [dict(e) for e in adv_force]

    if tier == "high":
        return [
            {
                "faction": e["faction"],
                "role": e.get("role"),
                "count": e["count"],
                "probable_platforms": [e["platform_id"]],
                "fidelity": "high",
            }
            for e in adv_force
        ]

    if tier == "medium":
        return [
            {
                "faction": e["faction"],
                "role": e.get("role"),
                "count_range": [max(0, e["count"] - 2), e["count"] + 2],
                "probable_platforms": [e["platform_id"]],
                "fidelity": "medium",
            }
            for e in adv_force
        ]

    # low
    if not adv_force:
        return []
    return [{
        "faction": adv_force[0]["faction"],
        "count_range": [max(0, total - 4), total + 4],
        "probable_platforms": [],
        "fidelity": "low",
    }]
