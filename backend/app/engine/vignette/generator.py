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
        # Weighted pick by inventory count
        weights = [inv[p] for p in pool]
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
