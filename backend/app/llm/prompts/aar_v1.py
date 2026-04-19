"""AAR prompt v1 — narrates a resolved vignette as a 4-8 paragraph report."""
from __future__ import annotations

import json

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "aar"
VERSION = "v1"


SYSTEM_PROMPT = """You are the author of an After-Action Report for the
Indian Air Force Integration Directorate. Write in the restrained,
technical voice of a real IAF post-strike debrief — clipped sentences,
squadron callsigns, platform designations, weapon names. 4 to 8
paragraphs. Do not invent platforms or weapons not present in the input.
Do not use the word "thrilling" or similar dramatic fillers. End with a
single italicised line beginning "Directorate note:".
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    scen = inputs["scenario_name"]
    ao = inputs["ao"]
    y, q = inputs["year"], inputs["quarter"]
    adv_force = inputs["planning_state"]["adversary_force"]
    committed = inputs["committed_force"]
    outcome = inputs["outcome"]
    trace = inputs["event_trace"]

    lines = [
        f"# Vignette: {scen}",
        f"Date: {y}-Q{q}.  AO: {ao.get('name', ao.get('region'))}.",
        "",
        "## Adversary order of battle",
    ]
    for entry in adv_force:
        lines.append(f"- {entry['role']}: {entry['count']}x "
                     f"{entry['platform_id']} ({entry['faction']})")

    lines.append("")
    lines.append("## Indian force commitment")
    # committed['squadrons'] only carries {squadron_id, airframes}. Join
    # with planning_state.eligible_squadrons to get name + platform_id.
    eligible_by_id = {
        e.get("squadron_id"): e
        for e in inputs.get("planning_state", {}).get("eligible_squadrons", [])
    }
    for sq in committed["squadrons"]:
        meta = eligible_by_id.get(sq.get("squadron_id"), {})
        name = sq.get("name") or meta.get("name") or f"Sqn#{sq.get('squadron_id')}"
        platform_id = sq.get("platform_id") or meta.get("platform_id") or "unknown"
        lines.append(f"- {name} ({platform_id}): "
                     f"{sq['airframes']} airframes")
    supp = committed.get("support", {})
    lines.append(f"- Support: AWACS={supp.get('awacs')}, "
                 f"Tanker={supp.get('tanker')}, SEAD={supp.get('sead_package')}")
    lines.append(f"- ROE: {committed.get('roe')}")

    lines.append("")
    lines.append("## Event trace (chronological)")
    for e in trace:
        t_min = e.get("t_min", "?")
        kind = e.get("kind", "event")
        side = e.get("side") or e.get("faction") or "—"
        # Build a compact detail line from the most useful fields. Different
        # event kinds have different shapes — we defensively render what's there.
        bits: list[str] = []
        for key in ("attacker_platform", "victim_platform", "target_platform", "weapon",
                    "distance_km", "pk", "advantage", "ind_radar_km", "adv_radar_km",
                    "ind_survivors", "adv_survivors", "battery_system", "base_name",
                    "attackers", "defenders", "reason"):
            if key in e and e[key] is not None:
                bits.append(f"{key}={e[key]}")
        detail = e.get("detail")
        if detail:
            bits.insert(0, str(detail))
        lines.append(f"- t+{t_min}m [{side}] {kind}: {', '.join(bits) if bits else ''}")

    lines.append("")
    lines.append("## Outcome")
    lines.append(json.dumps(outcome, indent=2))

    lines.append("")
    lines.append("Write the After-Action Report now.")
    return "\n".join(lines)


def build_messages(inputs: dict) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _render_user_prompt(inputs)},
    ]


def build_input_hash(inputs: dict) -> str:
    canonical = {
        "scenario_name": inputs["scenario_name"],
        "ao": inputs["ao"],
        "year": inputs["year"],
        "quarter": inputs["quarter"],
        "adversary_force": inputs["planning_state"]["adversary_force"],
        "committed_force": inputs["committed_force"],
        "outcome": inputs["outcome"],
        "event_trace": inputs["event_trace"],
    }
    return _canonical_hash(canonical)


import sys as _sys
register(_sys.modules[__name__])
