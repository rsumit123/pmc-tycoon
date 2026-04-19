"""Loadout upgrade queue tick.

Pure function. Completes upgrades whose (completion_year, completion_quarter)
is <= the current turn. Returns (completed_list, still_pending_list).

Each completed entry has:
  - id: int
  - squadron_id: int
  - weapon_id: str
  - final_loadout: list[str]  (base_loadout with same-class weapons replaced)
"""
from __future__ import annotations


SAME_CLASS_GROUPS: list[set[str]] = [
    {"astra_mk1", "astra_mk2", "astra_mk3"},
    {"rudram_2", "rudram_3"},
    {"meteor", "mica_ir"},
    {"r77", "r73"},
]


def _replace_same_class(existing: list[str], new_weapon: str) -> list[str]:
    group = next((g for g in SAME_CLASS_GROUPS if new_weapon in g), None)
    if group is None:
        return existing if new_weapon in existing else existing + [new_weapon]
    out = [w for w in existing if w not in group]
    out.append(new_weapon)
    return out


def tick_loadout_upgrades(
    upgrades: list[dict],
    year: int,
    quarter: int,
) -> tuple[list[dict], list[dict]]:
    completed: list[dict] = []
    remaining: list[dict] = []
    for u in upgrades:
        if u.get("status") != "pending":
            continue
        due = (u["completion_year"], u["completion_quarter"]) <= (year, quarter)
        if due:
            final = _replace_same_class(list(u.get("base_loadout") or []), u["weapon_id"])
            completed.append({
                "id": u["id"],
                "squadron_id": u["squadron_id"],
                "weapon_id": u["weapon_id"],
                "final_loadout": final,
            })
        else:
            remaining.append(u)
    return completed, remaining
