"""Squadron readiness regen / degradation.

Per quarter, each squadron's readiness moves toward a target driven by
how well the O&M + Spares buckets cover per-squadron baselines.

target = clamp(60 + 30 * combined_factor, 60, 100)
combined_factor = clamp(0.6 * om_factor + 0.4 * spares_factor, 0, 2)
om_factor = om_cr / (n_squadrons * OM_PER_SQUADRON_BASELINE)
spares_factor = spares_cr / (n_squadrons * SPARES_PER_SQUADRON_BASELINE)

Readiness moves toward target by min(STEP, |target - current|), clamped
to [MIN_READINESS, 100]. Emits readiness_changed when delta != 0.

The rng parameter is reserved for later variance (e.g., monsoon
groundings) and currently unused — keeping the signature stable for
turn.py to call without special-casing.
"""

from __future__ import annotations

import random

OM_PER_SQUADRON_BASELINE = 1000
SPARES_PER_SQUADRON_BASELINE = 500
STEP = 5
MIN_READINESS = 20
MAX_READINESS = 100
BASE_TARGET = 60
TARGET_RANGE = 30


def target_readiness(om_cr: int, spares_cr: int, n_squadrons: int) -> int:
    if n_squadrons <= 0:
        return 0
    om_factor = om_cr / (n_squadrons * OM_PER_SQUADRON_BASELINE)
    spares_factor = spares_cr / (n_squadrons * SPARES_PER_SQUADRON_BASELINE)
    combined = max(0.0, min(2.0, 0.6 * om_factor + 0.4 * spares_factor))
    target = BASE_TARGET + TARGET_RANGE * combined
    return int(min(MAX_READINESS, target))


def tick_readiness(
    squadrons: list[dict],
    om_cr: int,
    spares_cr: int,
    rng: random.Random,
) -> tuple[list[dict], list[dict]]:
    out: list[dict] = [dict(s) for s in squadrons]
    events: list[dict] = []
    if not out:
        return out, events

    target = target_readiness(om_cr, spares_cr, n_squadrons=len(out))

    for sq in out:
        old = sq["readiness_pct"]
        if old == target:
            continue
        direction = 1 if target > old else -1
        step = min(STEP, abs(target - old))
        new = old + direction * step
        new = max(MIN_READINESS, min(MAX_READINESS, new))
        sq["readiness_pct"] = new
        events.append({
            "event_type": "readiness_changed",
            "payload": {
                "squadron_id": sq["id"],
                "old": old,
                "new": new,
                "target": target,
            },
        })

    return out, events
