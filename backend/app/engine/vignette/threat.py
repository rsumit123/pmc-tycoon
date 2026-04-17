"""Threat curve: probability a vignette fires on a given turn.

Linear interp from 0.15 at 2026-Q2 to 0.55 at 2036-Q1 (40 quarters).
Hits ~0.34 mid-campaign (2031-Q1, q_index=19), matching the spec's
~35% mid-campaign target.
"""

from __future__ import annotations

import random


START_PROB = 0.15
END_PROB = 0.55
TOTAL_QUARTERS = 40
# Interp spans q_index 0 (2026-Q2) through TOTAL_QUARTERS - 1 (2036-Q1), so
# the endpoint lands exactly on END_PROB. 39 intervals between 40 turns.
_SPAN = TOTAL_QUARTERS - 1


def threat_curve_prob(year: int, quarter: int) -> float:
    q_index = (year - 2026) * 4 + (quarter - 2)
    if q_index < 0:
        return START_PROB
    if q_index >= _SPAN:
        return END_PROB
    return START_PROB + (q_index / _SPAN) * (END_PROB - START_PROB)


def should_fire_vignette(rng: random.Random, year: int, quarter: int) -> bool:
    return rng.random() < threat_curve_prob(year, quarter)
