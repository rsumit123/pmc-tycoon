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
    for sq in committed["squadrons"]:
        lines.append(f"- {sq['name']} ({sq['platform_id']}): "
                     f"{sq['airframes']} airframes")
    supp = committed.get("support", {})
    lines.append(f"- Support: AWACS={supp.get('awacs')}, "
                 f"Tanker={supp.get('tanker')}, SEAD={supp.get('sead_package')}")
    lines.append(f"- ROE: {committed.get('roe')}")

    lines.append("")
    lines.append("## Event trace (chronological)")
    for e in trace:
        lines.append(f"- t+{e['t_min']}m [{e['side']}] {e['kind']}: {e['detail']}")

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
