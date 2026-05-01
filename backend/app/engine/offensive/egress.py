"""Egress phase: adversary CAP scramble + chase."""
from __future__ import annotations
import random
from typing import Any
from app.content.registry import strike_profiles


def resolve_egress(
    package: dict[str, Any],
    surviving_airframes: int,
    *,
    rng: random.Random,
) -> dict[str, Any]:
    profile = strike_profiles()[package["profile"]]
    if surviving_airframes <= 0 or profile.egress_risk <= 0:
        return {"airframes_lost": 0, "events": [{"phase": "egress", "type": "skipped"}]}
    losses = 0
    for _ in range(surviving_airframes):
        if rng.random() < profile.egress_risk:
            losses += 1
    return {
        "airframes_lost": losses,
        "events": [{"phase": "egress", "type": "chase", "airframes_lost": losses}],
    }
