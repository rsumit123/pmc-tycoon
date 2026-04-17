"""Doctrine progression per faction.

Each faction has a 3-tier ladder. A tier promotes when both a calendar
gate and an inventory/system gate are met. Once reached, doctrine is
sticky — no regression. Ties are broken by reaching for the highest
tier first (so a faction that meets tier-3 criteria goes straight to
tier 3, skipping tier 2).
"""

from __future__ import annotations

import copy

from app.engine.adversary.state import DOCTRINE_LADDER


def compute_doctrine(faction: str, state: dict, year: int) -> str:
    current = state["doctrine"]
    ladder = DOCTRINE_LADDER[faction]
    current_idx = ladder.index(current) if current in ladder else 0

    best_idx = current_idx

    if faction == "PLAAF":
        j20 = state["inventory"].get("j20a", 0)
        j35 = state["inventory"].get("j35a", 0)
        if year >= 2028 and (j20 + j35) >= 700:
            best_idx = max(best_idx, 1)
        if year >= 2032 and "yj21_operational" in state["active_systems"]:
            best_idx = max(best_idx, 2)
    elif faction == "PAF":
        j35e = state["inventory"].get("j35e", 0)
        j10ce = state["inventory"].get("j10ce", 0)
        if j35e >= 20:
            best_idx = max(best_idx, 1)
        if year >= 2030 and j35e >= 40 and j10ce >= 36:
            best_idx = max(best_idx, 2)
    elif faction == "PLAN":
        carriers = sum(
            state["inventory"].get(c, 0)
            for c in ("liaoning", "shandong", "fujian", "type004_carrier")
        )
        if year >= 2028 and state["inventory"].get("fujian", 0) >= 1:
            best_idx = max(best_idx, 1)
        if year >= 2033 and carriers >= 4:
            best_idx = max(best_idx, 2)

    return ladder[best_idx]


def progress_doctrine(faction: str, state: dict, year: int) -> tuple[dict, list[dict]]:
    new_doctrine = compute_doctrine(faction, state, year)
    if new_doctrine == state["doctrine"]:
        return state, []

    new_state = copy.deepcopy(state)
    old_doctrine = state["doctrine"]
    new_state["doctrine"] = new_doctrine
    return new_state, [{
        "event_type": "adversary_doctrine_shifted",
        "payload": {
            "faction": faction,
            "from": old_doctrine,
            "to": new_doctrine,
            "year": year,
        },
    }]
