"""Threat curves: per-faction probability a vignette fires on a given turn.

Baseline curve (PLAAF): linear 0.20 -> 0.55 across 40 quarters (2026-Q2 to 2036-Q1).
PAF: scaled 0.70x of PLAAF curve (smaller air force, less strategic reach).
PLAN: starts at 0.05, ramps to 0.45 (naval buildup accelerates late-decade).

Any-faction composite: 3 independent rolls. At mid-campaign this yields
~58% fire rate vs the old ~34%, producing roughly one kinetic event every
1.7 turns instead of every 3.
"""

from __future__ import annotations

import random


START_PROB = 0.20
END_PROB = 0.55
TOTAL_QUARTERS = 40
_SPAN = TOTAL_QUARTERS - 1

FACTIONS: tuple[str, ...] = ("PLAAF", "PAF", "PLAN")


def _baseline_curve(year: int, quarter: int) -> float:
    q_index = (year - 2026) * 4 + (quarter - 2)
    if q_index < 0:
        return START_PROB
    if q_index >= _SPAN:
        return END_PROB
    return START_PROB + (q_index / _SPAN) * (END_PROB - START_PROB)


def threat_curve_prob(year: int, quarter: int) -> float:
    """Backwards-compatible alias — returns the PLAAF baseline curve."""
    return _baseline_curve(year, quarter)


def threat_curve_prob_for_faction(faction: str, year: int, quarter: int) -> float:
    base = _baseline_curve(year, quarter)
    if faction == "PLAAF":
        return base
    if faction == "PAF":
        return base * 0.70
    if faction == "PLAN":
        q_index = (year - 2026) * 4 + (quarter - 2)
        t = max(0.0, min(1.0, q_index / _SPAN))
        start = 0.05
        end = 0.45
        return start + t * (end - start)
    return base


def should_fire_vignette_for_faction(
    rng: random.Random, faction: str, year: int, quarter: int,
) -> bool:
    return rng.random() < threat_curve_prob_for_faction(faction, year, quarter)


def any_faction_fires(rng: random.Random, year: int, quarter: int) -> bool:
    """Roll independently per faction; return True if any fires."""
    for f in FACTIONS:
        if should_fire_vignette_for_faction(rng, f, year, quarter):
            return True
    return False


def should_fire_vignette(rng: random.Random, year: int, quarter: int) -> bool:
    """Legacy helper — now delegates to any_faction_fires."""
    return any_faction_fires(rng, year, quarter)
