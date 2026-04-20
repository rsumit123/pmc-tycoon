"""Pure-function campaign performance aggregator.

Given a list of resolved-vignette dicts (planning_state / committed_force /
event_trace / outcome), returns a dict matching PerformanceResponse
shape. No DB, no ORM, no side effects — easy to unit test.

Shape:
    {
        "totals": { total_sorties, total_kills, total_losses,
                    total_munitions_cost_cr, avg_cost_per_kill_cr },
        "factions": [ { faction, sorties, wins, losses, win_rate_pct,
                        avg_exchange_ratio, avg_munitions_cost_cr }, ... ],
        "platforms": [ { platform_id, platform_name, sorties, kills, losses,
                         kd_ratio, win_contribution_pct, first_shot_pct,
                         top_weapon }, ... ],
        "weapons":   [ { weapon_id, fired, hits, hit_rate_pct, avg_pk,
                         total_cost_cr, cost_per_kill_cr,
                         top_target_platform, weapon_class }, ... ],
        "support":   [ { asset, with_sorties, without_sorties,
                         with_win_rate_pct, without_win_rate_pct,
                         delta_win_rate_pp }, ... ],
    }
"""
from __future__ import annotations


FACTION_ORDER = ["PLAAF", "PAF", "PLAN"]
SUPPORT_KEYS = ["awacs", "tanker", "sead"]  # maps to support.awacs / support.tanker / support.sead_package


def _faction_of(vignette: dict) -> str:
    force = vignette.get("planning_state", {}).get("adversary_force", [])
    if force and "faction" in force[0]:
        return force[0]["faction"]
    return "UNKNOWN"


def _aggregate_factions(resolved_vignettes: list[dict]) -> list[dict]:
    # Seed every faction with zeroes so the response order is stable.
    agg = {
        f: {"sorties": 0, "wins": 0, "losses": 0, "ind_losses": 0, "adv_losses": 0, "munitions": 0}
        for f in FACTION_ORDER
    }
    for v in resolved_vignettes:
        faction = _faction_of(v)
        if faction not in agg:
            continue  # skip UNKNOWN/unexpected factions rather than creating new rows
        outcome = v.get("outcome") or {}
        a = agg[faction]
        a["sorties"] += 1
        if outcome.get("objective_met"):
            a["wins"] += 1
        else:
            a["losses"] += 1
        a["ind_losses"] += int(outcome.get("ind_airframes_lost", 0) or 0)
        a["adv_losses"] += int(outcome.get("adv_airframes_lost", 0) or 0)
        a["munitions"] += int(outcome.get("munitions_cost_total_cr", 0) or 0)

    out = []
    for f in FACTION_ORDER:
        a = agg[f]
        sorties = a["sorties"]
        win_rate = round((a["wins"] / sorties) * 100) if sorties > 0 else 0
        if sorties == 0:
            exchange = None
        else:
            exchange = round(a["adv_losses"] / max(1, a["ind_losses"]), 2)
        avg_munitions = (a["munitions"] // sorties) if sorties > 0 else 0
        out.append({
            "faction": f,
            "sorties": sorties,
            "wins": a["wins"],
            "losses": a["losses"],
            "win_rate_pct": win_rate,
            "avg_exchange_ratio": exchange,
            "avg_munitions_cost_cr": avg_munitions,
        })
    return out


def compute_performance(
    resolved_vignettes: list[dict],
    platforms_by_id: dict[str, dict],
    weapons_by_id: dict[str, dict],
) -> dict:
    total_sorties = len(resolved_vignettes)
    total_kills = 0
    total_losses = 0
    total_munitions_cost = 0

    for v in resolved_vignettes:
        trace = v.get("event_trace") or []
        outcome = v.get("outcome") or {}
        for ev in trace:
            if ev.get("kind") != "kill":
                continue
            if ev.get("side") == "ind":
                total_kills += 1
            elif ev.get("side") == "adv":
                total_losses += 1
        total_munitions_cost += int(outcome.get("munitions_cost_total_cr", 0) or 0)

    avg_cost_per_kill = (total_munitions_cost // total_kills) if total_kills > 0 else None

    return {
        "totals": {
            "total_sorties": total_sorties,
            "total_kills": total_kills,
            "total_losses": total_losses,
            "total_munitions_cost_cr": total_munitions_cost,
            "avg_cost_per_kill_cr": avg_cost_per_kill,
        },
        "factions": _aggregate_factions(resolved_vignettes),
        "platforms": [],
        "weapons": [],
        "support": [
            {
                "asset": a,
                "with_sorties": 0,
                "without_sorties": 0,
                "with_win_rate_pct": 0,
                "without_win_rate_pct": 0,
                "delta_win_rate_pp": 0,
            }
            for a in SUPPORT_KEYS
        ],
    }
