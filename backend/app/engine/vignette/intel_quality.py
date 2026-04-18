"""Score intel quality for a vignette — drives fog-of-war display.

Pure function. Inputs:
- awacs_covering_count: number of AWACS squadrons whose orbit covers the AO
- recent_intel_confidences: list of 0-1 confidence floats for recent intel
  cards on the adversary's faction (last 2 quarters)
- adversary_stealth_fraction: 0-1, fraction of incoming adversary force that
  is VLO/LO — stealth reduces detectability

Output dict:
  {
    "score": 0..1 float,
    "tier": "low" | "medium" | "high" | "perfect",
    "modifiers": {
      "awacs": float,
      "intel": float,
      "stealth_penalty": float,
    },
  }

Tier boundaries:
  [0.00, 0.30)  → low      (count range, no platform IDs)
  [0.30, 0.65)  → medium   (approximate count ±2, top-2 platform guess)
  [0.65, 0.90)  → high     (exact count, probable ID)
  [0.90, 1.00]  → perfect  (exact)
"""
from __future__ import annotations

AWACS_WEIGHT = 0.25
INTEL_WEIGHT = 0.50
STEALTH_PENALTY = 0.35


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def score_intel_quality(
    awacs_covering_count: int,
    recent_intel_confidences: list[float],
    adversary_stealth_fraction: float,
) -> dict:
    awacs_mod = min(1.0, awacs_covering_count * 0.5) * AWACS_WEIGHT
    intel_mod = (
        sum(recent_intel_confidences) / max(1, len(recent_intel_confidences))
        if recent_intel_confidences else 0.0
    ) * INTEL_WEIGHT
    stealth_mod = -adversary_stealth_fraction * STEALTH_PENALTY

    base = 0.15  # baseline ambient SIGINT/OSINT
    raw = base + awacs_mod + intel_mod + stealth_mod
    score = _clamp(raw)

    if score < 0.30:
        tier = "low"
    elif score < 0.65:
        tier = "medium"
    elif score < 0.90:
        tier = "high"
    else:
        tier = "perfect"

    return {
        "score": round(score, 3),
        "tier": tier,
        "modifiers": {
            "awacs": round(awacs_mod, 3),
            "intel": round(intel_mod, 3),
            "stealth_penalty": round(stealth_mod, 3),
        },
    }
