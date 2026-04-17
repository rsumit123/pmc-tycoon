"""Intel brief prompt v1 — every-few-quarters long-form strategic read."""
from __future__ import annotations

import json

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "intel_brief"
VERSION = "v1"

SYSTEM_PROMPT = """You are the Directorate of Air Intelligence, producing a
quarterly long-form brief for the Head of Defense Integration. Cover PLAAF,
PAF, and PLAN in that order. Each section is 2-4 paragraphs. Cite the
recent intel source types (SIGINT/HUMINT/IMINT/OSINT/ELINT) inline. End with
a 3-bullet "Implications" block. Do not invent numbers not present in the
input. No dramatic language.
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    y, q = inputs["year"], inputs["quarter"]
    adv = inputs["adversary_states"]
    cards = inputs["recent_intel_cards"]
    lines = [f"# Quarterly Intelligence Brief — {y}-Q{q}", ""]
    for faction in ("PLAAF", "PAF", "PLAN"):
        s = adv.get(faction, {})
        lines.append(f"## {faction}")
        lines.append(f"- Doctrine tier: {s.get('doctrine_tier')}")
        lines.append(f"- Inventory snapshot: {json.dumps(s.get('inventory', {}))}")
        lines.append(f"- Recent events: {s.get('recent_events', [])}")
        lines.append("")
    lines.append("## Recent collected intel")
    for c in cards:
        lines.append(f"- [{c['source_type']}] ({c['confidence']:.2f}) "
                     f"{c['headline']}")
    lines.append("")
    lines.append("Write the brief now.")
    return "\n".join(lines)


def build_messages(inputs: dict) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _render_user_prompt(inputs)},
    ]


def build_input_hash(inputs: dict) -> str:
    canonical = {
        "year": inputs["year"], "quarter": inputs["quarter"],
        "adversary_states": inputs["adversary_states"],
        "recent_intel_cards": inputs["recent_intel_cards"],
    }
    return _canonical_hash(canonical)


import sys as _sys
register(_sys.modules[__name__])
