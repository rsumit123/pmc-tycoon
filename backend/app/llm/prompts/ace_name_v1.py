"""Ace-name prompt v1 — produces a single-line squadron ace callsign."""
from __future__ import annotations

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "ace_name"
VERSION = "v1"

SYSTEM_PROMPT = """You name emerging IAF aces after notable engagements.
Output EXACTLY ONE LINE in the format:  "Sqn Ldr <Name> 'Callsign'".
Use plausible Indian names. The callsign should be short (1-2 words),
thematic to the platform and squadron lineage. Do not add any other text,
no quotes around the whole thing, no trailing commentary.
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    v = inputs["vignette"]
    return (
        f"Squadron: {inputs['squadron_name']}\n"
        f"Platform: {inputs['platform_id']}\n"
        f"Engagement: {v['scenario_name']} ({v['year']}-Q{v['quarter']})\n"
        f"Outcome: {v['outcome']['adv_kia']} adversary kills, "
        f"{v['outcome']['ind_airframes_lost']} Indian losses.\n"
        f"\nProduce the callsign line."
    )


def build_messages(inputs: dict) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _render_user_prompt(inputs)},
    ]


def build_input_hash(inputs: dict) -> str:
    canonical = {
        "squadron_name": inputs["squadron_name"],
        "platform_id": inputs["platform_id"],
        "vignette": inputs["vignette"],
    }
    return _canonical_hash(canonical)


import sys as _sys
register(_sys.modules[__name__])
