"""Top-level offensive resolver — chains penetration → strike → egress.

Pure function. RNG injected. Caller persists OffensiveOp + BaseDamage rows.
"""
from __future__ import annotations
import random
from typing import Any

from app.engine.offensive.penetration import resolve_penetration
from app.engine.offensive.strike_phase import resolve_strike_phase
from app.engine.offensive.egress import resolve_egress


def resolve_strike(
    package: dict[str, Any],
    target: dict[str, Any],
    *,
    rng: random.Random,
) -> dict[str, Any]:
    package_size = sum(sq.get("airframes", 0) for sq in package.get("squadrons", []))

    pen = resolve_penetration(package, target, rng=rng)
    surviving = max(0, package_size - pen["airframes_lost"])

    strike = resolve_strike_phase(package, target, surviving_airframes=surviving, rng=rng)
    egress = resolve_egress(package, surviving, rng=rng)

    total_lost = pen["airframes_lost"] + egress["airframes_lost"]
    events = [
        *pen["events"],
        {"phase": "strike", "type": "bda", **strike["landed_by_class"]},
        *egress["events"],
    ]

    return {
        "damage": strike["damage"],
        "ind_airframes_lost": total_lost,
        "weapons_consumed": strike["weapons_consumed"],
        "events": events,
    }
