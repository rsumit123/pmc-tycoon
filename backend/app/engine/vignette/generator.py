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


def build_planning_state(
    template: ScenarioTemplate,
    adversary_states: dict[str, dict],
    rng: random.Random,
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

    return {
        "scenario_id": template.id,
        "scenario_name": template.name,
        "ao": dict(template.ao),
        "response_clock_minutes": template.response_clock_minutes,
        "adversary_force": adv_force,
        "eligible_squadrons": [],  # planning.py fills this in
        "allowed_ind_roles": list(template.allowed_ind_roles),
        "roe_options": list(template.roe_options),
        "objective": dict(template.objective),
    }
