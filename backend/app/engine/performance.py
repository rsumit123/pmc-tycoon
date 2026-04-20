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


def compute_performance(
    resolved_vignettes: list[dict],
    platforms_by_id: dict[str, dict],
    weapons_by_id: dict[str, dict],
) -> dict:
    return {
        "totals": {
            "total_sorties": 0,
            "total_kills": 0,
            "total_losses": 0,
            "total_munitions_cost_cr": 0,
            "avg_cost_per_kill_cr": None,
        },
        "factions": [
            {
                "faction": f,
                "sorties": 0,
                "wins": 0,
                "losses": 0,
                "win_rate_pct": 0,
                "avg_exchange_ratio": None,
                "avg_munitions_cost_cr": 0,
            }
            for f in FACTION_ORDER
        ],
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
