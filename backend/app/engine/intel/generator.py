"""Intel card generator.

Each turn: pick 4-7 eligible templates, render them against adversary
state, roll for source type + truth value, pass through fog filter.
Additionally emit one card for each roadmap event that carries an
`intel` block. Output is a list of dicts ready to persist as IntelCard
rows.
"""

from __future__ import annotations

import copy
import random
from typing import Any

from app.engine.intel.fog import SOURCE_RULES, apply_fog

MIN_CARDS = 4
MAX_CARDS = 7


def is_template_eligible(template, faction: str, state: dict) -> bool:
    if template.faction != faction:
        return False
    trigger = template.trigger or {}

    min_inv = trigger.get("min_inventory", {})
    for unit, threshold in min_inv.items():
        if state["inventory"].get(unit, 0) < threshold:
            return False

    req_system = trigger.get("requires_system")
    if req_system and req_system not in state["active_systems"]:
        return False

    # Template payload may reference forward_bases or active_systems;
    # if so and those lists are empty, skip.
    for key_spec in template.payload_keys.values():
        if key_spec.get("source") == "forward_bases" and not state["forward_bases"]:
            return False
        if key_spec.get("source") == "active_systems" and not state["active_systems"]:
            return False

    return True


def _render_card(
    template, faction: str, state: dict, rng: random.Random,
) -> dict:
    ground_truth: dict[str, Any] = {}
    for key, spec in template.payload_keys.items():
        ground_truth[key] = _render_value(spec, state, rng)

    headline = template.headline_template.format(**ground_truth)
    source_type = rng.choice(template.source_types)
    lo, hi = SOURCE_RULES[source_type]["confidence_range"]
    confidence = rng.uniform(lo, hi)
    truth_value = rng.random() >= SOURCE_RULES[source_type]["false_rate"]

    observed = copy.deepcopy(ground_truth)

    card = {
        "source_type": source_type,
        "confidence": round(confidence, 3),
        "truth_value": truth_value,
        "payload": {
            "headline": headline,
            "template_id": template.id,
            "subject_faction": faction,
            "subject_type": template.subject_type,
            "observed": observed,
            "ground_truth": ground_truth,
        },
    }

    if not truth_value:
        apply_fog(card, rng)
        # Re-render headline from (mutated) observed values if applicable.
        try:
            card["payload"]["headline"] = template.headline_template.format(**card["payload"]["observed"])
        except (KeyError, ValueError):
            pass  # leave original headline if mutation dropped a placeholder key

    return card


def _render_value(spec: dict, state: dict, rng: random.Random):
    source = spec["source"]
    if source == "literal":
        return spec["value"]
    if source == "doctrine":
        return state["doctrine"]
    if source == "inventory":
        raw = state["inventory"].get(spec["key"], 0)
        scale = spec.get("scale", 1.0)
        noise = spec.get("noise", 0.0)
        value = raw * scale
        if noise:
            value *= rng.uniform(1 - noise, 1 + noise)
        return max(0, int(value))
    if source == "forward_bases":
        return rng.choice(state["forward_bases"])
    if source == "active_systems":
        return rng.choice(state["active_systems"])
    raise ValueError(f"unknown payload_keys source: {source!r}")


def generate_intel(
    states: dict[str, dict],
    templates: list,
    roadmap_events: list,
    year: int,
    quarter: int,
    rng: random.Random,
) -> tuple[list[dict], list[dict]]:
    emitted_events: list[dict] = []
    cards: list[dict] = []

    target = rng.randint(MIN_CARDS, MAX_CARDS)

    # Eligible templates, paired with the owning faction.
    eligible: list[tuple] = []
    for faction, state in states.items():
        for tpl in templates:
            if is_template_eligible(tpl, faction, state):
                eligible.append((tpl, faction, state))

    if not eligible:
        emitted_events.append({
            "event_type": "intel_underfilled",
            "payload": {"reason": "no_eligible_templates", "target": target, "produced": 0},
        })
        # Fall through to roadmap-driven cards
    else:
        picks = [rng.choice(eligible) for _ in range(target)] if len(eligible) >= 1 else []
        for tpl, faction, state in picks:
            cards.append(_render_card(tpl, faction, state, rng))

    if cards and len(cards) < MIN_CARDS:
        emitted_events.append({
            "event_type": "intel_underfilled",
            "payload": {"reason": "insufficient_cards", "target": target, "produced": len(cards)},
        })

    # Roadmap-driven intel cards (one per event with intel block matching turn)
    for evt in roadmap_events:
        if evt.year != year or evt.quarter != quarter:
            continue
        if evt.intel is None:
            continue
        faction_state = states.get(evt.faction, {})
        truth_value = True if evt.intel.forced_true else (
            rng.random() >= SOURCE_RULES[evt.intel.source_type]["false_rate"]
        )
        ground_truth = {"event_kind": evt.effect.kind}
        card = {
            "source_type": evt.intel.source_type,
            "confidence": evt.intel.confidence,
            "truth_value": truth_value,
            "payload": {
                "headline": evt.intel.headline,
                "template_id": "__roadmap__",
                "subject_faction": evt.faction,
                "subject_type": "deployment_observation",
                "observed": copy.deepcopy(ground_truth),
                "ground_truth": ground_truth,
            },
        }
        if not truth_value:
            apply_fog(card, rng)
        cards.append(card)

    for c in cards:
        emitted_events.append({
            "event_type": "intel_card_generated",
            "payload": {
                "faction": c["payload"]["subject_faction"],
                "source_type": c["source_type"],
                "truth_value": c["truth_value"],
                "template_id": c["payload"]["template_id"],
            },
        })

    return cards, emitted_events
