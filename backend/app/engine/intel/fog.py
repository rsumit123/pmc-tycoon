"""Fog-of-war truth filter.

When a card is marked false (truth_value=False), apply_fog mutates the
`observed` dict so it diverges from `ground_truth`. The mutation
strategy depends on the card's subject_type.

SOURCE_RULES defines per-source-type confidence ranges and false rates.
The generator reads these for both roll outcomes AND for the overall
~1-in-3 wrong target across a turn's card mix.
"""

from __future__ import annotations

import random

SOURCE_RULES: dict[str, dict] = {
    "HUMINT": {"confidence_range": (0.40, 0.80), "false_rate": 0.30},
    "SIGINT": {"confidence_range": (0.60, 0.90), "false_rate": 0.15},
    "IMINT":  {"confidence_range": (0.70, 1.00), "false_rate": 0.10},
    "OSINT":  {"confidence_range": (0.30, 0.70), "false_rate": 0.40},
    "ELINT":  {"confidence_range": (0.60, 0.90), "false_rate": 0.15},
}


def apply_fog(card: dict, rng: random.Random) -> None:
    """Mutate card['payload']['observed'] in place based on subject_type.

    Does not touch source_type, confidence, or ground_truth.
    Graceful on unknown subject_types (no-op).
    """
    observed = card["payload"]["observed"]
    subject_type = card["payload"]["subject_type"]
    alternates = card["payload"].get("_fog_alternates", {})

    if subject_type == "force_count":
        if "count" in observed:
            factor = rng.uniform(0.4, 1.7)
            observed["count"] = max(0, int(observed["count"] * factor))
    elif subject_type == "base_rotation":
        if "base" in observed:
            choices = alternates.get("base", [])
            choices = [b for b in choices if b != observed["base"]]
            if choices:
                observed["base"] = rng.choice(choices)
    elif subject_type == "doctrine_guess":
        if "doctrine" in observed:
            choices = alternates.get("doctrine", [])
            choices = [d for d in choices if d != observed["doctrine"]]
            if choices:
                observed["doctrine"] = rng.choice(choices)
    elif subject_type == "system_activation":
        if "active" in observed:
            observed["active"] = not observed["active"]
    # unknown subject_type: no-op (graceful degrade)
