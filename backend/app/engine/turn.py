"""End-of-turn orchestrator.

Pure function. Takes a context dict (current campaign state +
spec registry + adversary state + intel templates + roadmap), returns
an EngineResult containing all mutations to apply and the events to
log. The CRUD layer translates ORM rows to/from the dict shape this
engine expects.

Order of operations (locked):
    1. Normalize + validate allocation
    2. Apply quarterly grant to treasury
    3. R&D tick
    4. Acquisition tick
    5. Readiness tick
    6. Adversary tick (apply roadmap events + doctrine progression)
    7. Intel generation (reads post-tick adversary state)
    8. Deduct allocation from treasury
    9. Advance clock
    10. Emit turn_advanced event
"""

from __future__ import annotations

import copy
from dataclasses import dataclass, field
from typing import Any

from app.engine.budget import normalize_allocation, validate_allocation
from app.engine.rng import subsystem_rng
from app.engine.rd import tick_rd
from app.engine.acquisition import tick_acquisitions
from app.engine.readiness import tick_readiness
from app.engine.adversary.tick import tick_adversary
from app.engine.adversary.doctrine import progress_doctrine
from app.engine.intel.generator import generate_intel
from app.engine.vignette.threat import should_fire_vignette
from app.engine.vignette.generator import pick_scenario, build_planning_state
from app.content.registry import ad_systems as _ad_systems_reg
from app.engine.vignette.planning import compute_eligible_squadrons
from app.engine.loadout_upgrade import tick_loadout_upgrades


@dataclass
class EngineResult:
    next_year: int
    next_quarter: int
    next_treasury_cr: int
    next_rd_states: list[dict]
    next_acquisition_orders: list[dict]
    next_squadrons: list[dict]
    next_adversary_states: dict[str, dict] = field(default_factory=dict)
    new_intel_cards: list[dict] = field(default_factory=list)
    new_vignettes: list[dict] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    completed_loadout_upgrades: list[dict] = field(default_factory=list)


def _next_clock(year: int, quarter: int) -> tuple[int, int]:
    if quarter == 4:
        return year + 1, 1
    return year, quarter + 1


def advance(ctx: dict[str, Any]) -> EngineResult:
    seed = ctx["seed"]
    year = ctx["year"]
    quarter = ctx["quarter"]
    grant = ctx["quarterly_grant_cr"]

    available_cr = ctx["treasury_cr"] + grant
    allocation = normalize_allocation(ctx["current_allocation_json"], grant)
    validate_allocation(allocation, available_cr)

    # Deep-copy mutable inputs so subsystem shallow copies don't leak.
    rd_states_in = copy.deepcopy(ctx["rd_states"])
    orders_in = copy.deepcopy(ctx["acquisition_orders"])
    squadrons_in = copy.deepcopy(ctx["squadrons"])
    adversary_states_in = copy.deepcopy(ctx.get("adversary_states", {}))
    adversary_roadmap = ctx.get("adversary_roadmap", [])
    intel_templates = ctx.get("intel_templates", [])

    events: list[dict] = []

    rd_rng = subsystem_rng(seed, "rd", year, quarter)
    next_rd, rd_events = tick_rd(
        rd_states_in, ctx["rd_specs"], allocation["rd"], rd_rng,
    )
    events.extend(rd_events)

    next_orders, acq_events = tick_acquisitions(
        orders_in, year, quarter, allocation["acquisition"],
    )
    events.extend(acq_events)

    readiness_rng = subsystem_rng(seed, "readiness", year, quarter)
    next_squadrons, readiness_events = tick_readiness(
        squadrons_in, allocation["om"], allocation["spares"], readiness_rng,
    )
    events.extend(readiness_events)

    # Adversary tick (applies roadmap) + doctrine progression per faction
    adversary_rng = subsystem_rng(seed, "adversary", year, quarter)
    next_adversary, adv_events = tick_adversary(
        adversary_states_in, adversary_roadmap, year, quarter, adversary_rng,
    )
    events.extend(adv_events)
    for faction, state in list(next_adversary.items()):
        new_state, doc_events = progress_doctrine(faction, state, year)
        next_adversary[faction] = new_state
        events.extend(doc_events)

    # Intel generation reads post-tick adversary state
    new_cards: list[dict] = []
    if intel_templates or adversary_roadmap:
        intel_rng = subsystem_rng(seed, "intel", year, quarter)
        new_cards, intel_events = generate_intel(
            next_adversary, intel_templates, adversary_roadmap, year, quarter, intel_rng,
        )
        events.extend(intel_events)

    # Vignette threat roll (skip if player already has a pending vignette)
    new_vignettes: list[dict] = []
    pending_exists = ctx.get("pending_vignette_exists", False)
    scenario_templates_list = ctx.get("scenario_templates", [])
    bases_reg = ctx.get("bases_registry", {})
    platforms_reg = ctx.get("platforms_registry", {})
    if not pending_exists and scenario_templates_list:
        vignette_rng = subsystem_rng(seed, "vignette", year, quarter)
        if should_fire_vignette(vignette_rng, year, quarter):
            scenario = pick_scenario(scenario_templates_list, next_adversary,
                                     year, quarter, vignette_rng)
            if scenario is not None:
                # Recent intel confidences (use the new intel cards just generated)
                recent_conf = [c["confidence"] for c in new_cards if c.get("confidence") is not None][:5]

                ad_spec_dicts: dict = {}
                try:
                    ad_spec_dicts = {k: v.model_dump() for k, v in _ad_systems_reg().items()}
                except Exception:
                    ad_spec_dicts = {}

                planning_state = build_planning_state(
                    scenario, next_adversary, vignette_rng,
                    player_squadrons=next_squadrons,
                    bases_registry=bases_reg,
                    recent_intel_confidences=recent_conf,
                    ad_batteries=ctx.get("ad_batteries", []),
                    ad_specs=ad_spec_dicts,
                )
                planning_state["eligible_squadrons"] = compute_eligible_squadrons(
                    planning_state, next_squadrons, bases_reg, platforms_reg,
                )
                new_vignettes.append({
                    "scenario_id": scenario.id,
                    "planning_state": planning_state,
                    "year": year,
                    "quarter": quarter,
                })
                events.append({
                    "event_type": "vignette_fired",
                    "payload": {
                        "scenario_id": scenario.id,
                        "scenario_name": scenario.name,
                        "ao": planning_state["ao"],
                    },
                })

    # Loadout upgrade queue tick
    pending_upgrades = ctx.get("loadout_upgrades", [])
    completed_upgrades, _remaining = tick_loadout_upgrades(pending_upgrades, year, quarter)
    for c in completed_upgrades:
        events.append({
            "event_type": "loadout_upgrade_complete",
            "payload": {
                "upgrade_id": c["id"],
                "squadron_id": c["squadron_id"],
                "weapon_id": c["weapon_id"],
                "final_loadout": c["final_loadout"],
            },
        })

    next_treasury = available_cr - sum(allocation.values())
    next_year, next_quarter = _next_clock(year, quarter)

    events.append({
        "event_type": "turn_advanced",
        "payload": {
            "from_year": year, "from_quarter": quarter,
            "to_year": next_year, "to_quarter": next_quarter,
            "grant_cr": grant,
            "allocation": allocation,
            "treasury_after_cr": next_treasury,
        },
    })

    return EngineResult(
        next_year=next_year,
        next_quarter=next_quarter,
        next_treasury_cr=next_treasury,
        next_rd_states=next_rd,
        next_acquisition_orders=next_orders,
        next_squadrons=next_squadrons,
        next_adversary_states=next_adversary,
        new_intel_cards=new_cards,
        new_vignettes=new_vignettes,
        events=events,
        completed_loadout_upgrades=completed_upgrades,
    )
