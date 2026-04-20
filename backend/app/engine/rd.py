"""R&D program progression: funding, progress, milestones, risk events.

Pure function. Takes a list of program-state dicts + spec registry +
the R&D budget bucket + a Random instance. Returns (updated_states, events).

Funding levels:
    slow:        0.5x cost, 0.5x progress
    standard:    1.0x / 1.0x
    accelerated: 1.5x cost, 1.4x progress (efficiency penalty)

Milestone rolls (at 25/50/75/100): once per crossing.
    70% routine — no event
    15% breakthrough — +5% progress, rd_breakthrough event
    15% setback — rd_setback event (no progress penalty in MVP)

If R&D bucket can't cover all programs at their requested funding,
all programs scale by the same pro-rata factor and an rd_underfunded
event is logged.
"""

from __future__ import annotations

import random
from typing import Any

FUNDING_FACTORS: dict[str, tuple[float, float]] = {
    "slow": (0.5, 0.5),
    "standard": (1.0, 1.0),
    "accelerated": (1.5, 1.4),
}

MILESTONES: list[int] = [25, 50, 75, 100]

ROLL_BREAKTHROUGH_PROGRESS_BONUS = 5


def project_completion(
    progress_pct: int,
    base_duration_quarters: int,
    base_cost_cr: int,
    funding_level: str,
    current_year: int,
    current_quarter: int,
) -> dict:
    """Pure helper: project when a program would finish at given funding.

    Returns:
        {
            "completion_year": int,
            "completion_quarter": int (1-4),
            "quarters_remaining": int,
            "quarterly_cost_cr": int,
        }
    """
    cost_factor, prog_factor = FUNDING_FACTORS.get(funding_level, (1.0, 1.0))
    base_prog_per_qtr = 100.0 / base_duration_quarters
    effective_prog_per_qtr = base_prog_per_qtr * prog_factor
    remaining_pct = max(0, 100 - progress_pct)

    if effective_prog_per_qtr <= 0:
        quarters_remaining = 0
    else:
        # ceiling division: how many quarters to go from remaining_pct to 100%
        quarters_remaining = int(-(-remaining_pct // effective_prog_per_qtr))

    # Convert to absolute quarter count (from year 0, quarter 1)
    total_q = (current_year * 4 + (current_quarter - 1)) + quarters_remaining
    completion_year = total_q // 4
    completion_quarter = (total_q % 4) + 1

    quarterly_cost_cr = int((base_cost_cr / base_duration_quarters) * cost_factor)

    return {
        "completion_year": completion_year,
        "completion_quarter": completion_quarter,
        "quarters_remaining": quarters_remaining,
        "quarterly_cost_cr": quarterly_cost_cr,
    }


def _funded_program_states(states: list[dict]) -> list[dict]:
    return [s for s in states if s["status"] == "active" and s["progress_pct"] < 100]


def tick_rd(
    states: list[dict],
    specs: dict[str, Any],
    rd_bucket_cr: int,
    rng: random.Random,
) -> tuple[list[dict], list[dict]]:
    out: list[dict] = [dict(s) for s in states]
    events: list[dict] = []

    fundable = _funded_program_states(out)
    if not fundable:
        return out, events

    # Total cost requested at full funding
    requested = 0
    for s in fundable:
        spec = specs[s["program_id"]]
        cost_factor, _ = FUNDING_FACTORS[s["funding_level"]]
        per_quarter_base = spec["base_cost_cr"] / spec["base_duration_quarters"]
        requested += per_quarter_base * cost_factor

    # Pro-rata factor if bucket short
    pro_rata = 1.0
    if requested > 0 and rd_bucket_cr < requested:
        pro_rata = rd_bucket_cr / requested
        events.append({
            "event_type": "rd_underfunded",
            "payload": {"requested_cr": int(requested), "available_cr": rd_bucket_cr, "scale": round(pro_rata, 3)},
        })

    for s in fundable:
        spec = specs[s["program_id"]]
        cost_factor, prog_factor = FUNDING_FACTORS[s["funding_level"]]
        per_quarter_base_cost = spec["base_cost_cr"] / spec["base_duration_quarters"]
        per_quarter_base_prog = 100 / spec["base_duration_quarters"]

        cost_this_qtr = int(per_quarter_base_cost * cost_factor * pro_rata)
        prog_inc = int(per_quarter_base_prog * prog_factor * pro_rata)

        # Milestone rolls — one per threshold crossed by this turn's progress increment
        old_progress = s["progress_pct"]
        new_progress = min(100, old_progress + prog_inc)

        for threshold in MILESTONES:
            if old_progress < threshold <= new_progress and threshold not in s["milestones_hit"]:
                roll = rng.random()
                if roll < 0.70:
                    outcome = "routine"
                elif roll < 0.85:
                    outcome = "breakthrough"
                    new_progress = min(100, new_progress + ROLL_BREAKTHROUGH_PROGRESS_BONUS)
                else:
                    outcome = "setback"
                s["milestones_hit"].append(threshold)
                events.append({
                    "event_type": "rd_milestone",
                    "payload": {
                        "program_id": s["program_id"],
                        "threshold": threshold,
                        "outcome": outcome,
                    },
                })
                if outcome == "breakthrough":
                    events.append({
                        "event_type": "rd_breakthrough",
                        "payload": {"program_id": s["program_id"], "threshold": threshold},
                    })
                if outcome == "setback":
                    events.append({
                        "event_type": "rd_setback",
                        "payload": {"program_id": s["program_id"], "threshold": threshold},
                    })

        s["progress_pct"] = new_progress
        s["cost_invested_cr"] += cost_this_qtr
        s["quarters_active"] += 1

        events.append({
            "event_type": "rd_progressed",
            "payload": {
                "program_id": s["program_id"],
                "progress_pct": new_progress,
                "delta_pct": new_progress - old_progress,
                "cost_this_qtr_cr": cost_this_qtr,
            },
        })

        if new_progress >= 100 and s["status"] != "completed":
            s["status"] = "completed"
            # Flush integer-rounding residual: over a long program, the
            # per-quarter int() truncation accumulates. Reconcile so the
            # invariant cost_invested_cr == base_cost_cr * cost_factor holds
            # at completion.
            expected_total = int(round(spec["base_cost_cr"] * cost_factor))
            residual = max(0, expected_total - s["cost_invested_cr"])
            if residual > 0:
                s["cost_invested_cr"] = expected_total
            events.append({
                "event_type": "rd_completed",
                "payload": {"program_id": s["program_id"]},
            })

    return out, events
