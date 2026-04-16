"""Seeded random number generator infrastructure for deterministic gameplay.

Every Campaign carries an RNG seed. All engine randomness draws from
streams seeded from that value. Plan 2+ extends this with namespaced
streams (one per subsystem: R&D, intel, adversary, combat). For MVP we
expose a single factory — more structure lands when the turn engine does.
"""

from __future__ import annotations

import random


def make_rng(seed: int) -> random.Random:
    """Return a new Random instance seeded with the campaign seed.

    Use a fresh instance per call site to avoid cross-contamination between
    subsystems. The instance is fully deterministic and safe to pickle.
    """
    return random.Random(seed)
