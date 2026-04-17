"""Adversary tick: apply roadmap events for a given (year, quarter).

Pure function. Takes faction states, the FULL roadmap event list, the
current clock, and an RNG (reserved for later stochastic rotations).
Filters events to this (year, quarter) and applies them in list order.
Returns (updated_states, events).
"""

from __future__ import annotations

import copy
import random

VALID_KINDS = {
    "inventory_delta", "system_activate", "system_deactivate",
    "base_activate", "base_deactivate", "doctrine_override",
}


def tick_adversary(
    states: dict[str, dict],
    roadmap_events: list,
    year: int,
    quarter: int,
    rng: random.Random,
) -> tuple[dict[str, dict], list[dict]]:
    out = copy.deepcopy(states)
    emitted: list[dict] = []

    for evt in roadmap_events:
        if evt.year != year or evt.quarter != quarter:
            continue
        faction_state = out.setdefault(evt.faction, {
            "inventory": {}, "doctrine": "conservative",
            "active_systems": [], "forward_bases": [],
        })
        kind = evt.effect.kind
        if kind not in VALID_KINDS:
            raise ValueError(f"unknown roadmap effect kind: {kind!r}")

        _apply_effect(faction_state, kind, evt.effect.payload)

        emitted.append({
            "event_type": "adversary_roadmap_event_applied",
            "payload": {
                "faction": evt.faction,
                "kind": kind,
                "effect_payload": evt.effect.payload,
            },
        })

    return out, emitted


def _apply_effect(state: dict, kind: str, payload) -> None:
    if kind == "inventory_delta":
        inv = state["inventory"]
        for unit, delta in payload.items():
            inv[unit] = max(0, inv.get(unit, 0) + delta)
    elif kind == "system_activate":
        if payload not in state["active_systems"]:
            state["active_systems"].append(payload)
    elif kind == "system_deactivate":
        if payload in state["active_systems"]:
            state["active_systems"].remove(payload)
    elif kind == "base_activate":
        if payload not in state["forward_bases"]:
            state["forward_bases"].append(payload)
    elif kind == "base_deactivate":
        if payload in state["forward_bases"]:
            state["forward_bases"].remove(payload)
    elif kind == "doctrine_override":
        state["doctrine"] = payload
