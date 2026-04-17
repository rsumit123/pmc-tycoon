"""Adversary state shape + 2026-Q2 starting OOBs.

Faction state is a JSON dict with a fixed key set. All three factions
(PLAAF/PAF/PLAN) share the same shape — carriers/SAMs/destroyers land
in `inventory` alongside fighters so the engine can treat them uniformly.
"""

from __future__ import annotations

FACTIONS: list[str] = ["PLAAF", "PAF", "PLAN"]

DOCTRINE_LADDER: dict[str, list[str]] = {
    "PLAAF": ["conservative", "integrated_ew", "saturation_raid"],
    "PAF":   ["conservative", "stealth_enabled", "integrated_high_low"],
    "PLAN":  ["coastal_defense", "far_seas_buildout", "global_power_projection"],
}

REQUIRED_KEYS = {"inventory", "doctrine", "active_systems", "forward_bases"}

# Starting OOBs (2026-Q2) sourced from docs/content/platforms-seed-2026.md §Adversary Starting State.
# Numbers are semi-realistic per D10 — plausible and gameable, not canonical.
OOB_2026_Q2: dict[str, dict] = {
    "PLAAF": {
        "inventory": {
            "j20a": 500, "j20s": 20, "j35a": 20,
            "j11b": 200, "j10c": 300, "j16": 150,
            "h6kj": 120, "kj500": 40, "y20": 60,
        },
        "doctrine": "conservative",
        "active_systems": ["pl15_operational", "pl17_operational", "yj21_operational"],
        "forward_bases": ["hotan", "kashgar", "shigatse", "lhasa_gonggar"],
    },
    "PAF": {
        "inventory": {
            "j10ce": 20,       # 20 delivered mid-2025; 16 slated for 2026
            "j35e": 0,         # deal signed Jan 2026, first deliveries pending
            "jf17_blk3": 60,
            "f16_blk52": 75,
            "mirage35": 60,
        },
        "doctrine": "conservative",
        "active_systems": ["pl15_operational"],
        "forward_bases": ["sargodha", "masroor", "minhas"],
    },
    "PLAN": {
        "inventory": {
            "liaoning": 1, "shandong": 1, "fujian": 1,
            "type055_destroyer": 8,
            "type052d_destroyer": 25,
            "type093b_ssn": 6,
            "h6n": 8,
        },
        "doctrine": "coastal_defense",
        "active_systems": ["yj21_operational"],
        "forward_bases": ["sanya", "zhanjiang", "djibouti"],
    },
}


def empty_state() -> dict:
    return {"inventory": {}, "doctrine": "conservative",
            "active_systems": [], "forward_bases": []}


def validate_state(state: dict) -> None:
    missing = REQUIRED_KEYS - set(state.keys())
    if missing:
        raise ValueError(f"adversary state missing keys: {missing}")
    for unit, count in state["inventory"].items():
        if not isinstance(count, int) or count < 0:
            raise ValueError(f"inventory[{unit!r}] must be non-negative int (got {count!r})")
