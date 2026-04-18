"""Non-combat vignette resolution (escort, SAR, show of force).

Non-kinetic scenarios don't run through the BVR resolver. Outcome
depends on committed force vs objective thresholds. No airframe losses.
"""

from __future__ import annotations

NON_COMBAT_KINDS: set[str] = {"escort_intercept", "sar_recovery", "show_of_force"}


def is_non_combat(objective: dict) -> bool:
    return objective.get("kind") in NON_COMBAT_KINDS


def resolve_non_combat(planning_state: dict, committed_force: dict) -> tuple[dict, list[dict]]:
    """Pure function. Returns (outcome, trace) matching combat resolver shape."""
    objective = planning_state.get("objective", {})
    kind = objective.get("kind")
    threshold = objective.get("success_threshold", {})
    support = committed_force.get("support", {})
    roe = committed_force.get("roe", "weapons_tight")
    ind_airframes = sum(s.get("airframes", 0) for s in committed_force.get("squadrons", []))

    trace: list[dict] = [{"t_min": 0, "kind": "noncombat_start", "scenario_kind": kind}]
    met = False

    if kind == "escort_intercept":
        clean = ind_airframes >= 2 and roe in ("visual_id_required", "weapons_tight")
        met = bool(threshold.get("escort_clean", True)) and clean
        trace.append({"t_min": 5, "kind": "escort_complete", "intercept_airframes": ind_airframes, "roe": roe})

    elif kind == "sar_recovery":
        awacs_req = bool(threshold.get("awacs_committed", False))
        met = ind_airframes >= 1 and (not awacs_req or bool(support.get("awacs", False)))
        trace.append({"t_min": 10, "kind": "sar_swept", "awacs": bool(support.get("awacs")), "airframes": ind_airframes})

    elif kind == "show_of_force":
        need = int(threshold.get("airframes_committed_min", 1))
        met = ind_airframes >= need
        trace.append({"t_min": 5, "kind": "show_of_force_demo", "airframes": ind_airframes, "required": need})

    outcome = {
        "ind_kia": 0,
        "adv_kia": 0,
        "ind_airframes_lost": 0,
        "adv_airframes_lost": 0,
        "objective_met": met,
        "roe": roe,
        "support": {
            "awacs": bool(support.get("awacs", False)),
            "tanker": bool(support.get("tanker", False)),
            "sead_package": bool(support.get("sead_package", False)),
        },
    }
    trace.append({"t_min": 12, "kind": "outcome", "outcome": outcome})
    return outcome, trace
