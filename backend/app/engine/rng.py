"""Subsystem-namespaced seeded RNG.

Each subsystem (rd, acquisition, readiness, intel, adversary, vignette)
draws from its own deterministic stream keyed by
(campaign_seed, subsystem_name, year, quarter). Same inputs always
yield the same sequence, regardless of call order across subsystems.
"""

from __future__ import annotations

import hashlib
import random


def subsystem_rng(seed: int, subsystem: str, year: int, quarter: int) -> random.Random:
    composite = repr((seed, subsystem, year, quarter)).encode("utf-8")
    digest = hashlib.sha256(composite).digest()
    sub_seed = int.from_bytes(digest[:8], "big")
    return random.Random(sub_seed)
