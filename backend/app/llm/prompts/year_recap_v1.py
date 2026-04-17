"""Year recap prompt v1 — single-sentence summary of a completed year."""
from __future__ import annotations

import json

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "year_recap"
VERSION = "v1"

SYSTEM_PROMPT = """Produce exactly one sentence (max 30 words) summarising
the IAF's progress in the given year. Tone: clipped, factual. No emojis,
no dramatic language. Output only the sentence — no heading, no bullets.
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    return (
        f"Year: {inputs['year']}\n"
        f"Treasury: {inputs['starting_treasury_cr']} → {inputs['ending_treasury_cr']} cr\n"
        f"Deliveries: {inputs['acquisitions_delivered']}\n"
        f"R&D milestones: {inputs['rd_milestones']}\n"
        f"Vignettes: {inputs['vignettes_resolved']} resolved, "
        f"{inputs['vignettes_won']} won\n"
        f"Adversary shifts: {inputs['notable_adversary_shifts']}\n"
        "\nOne sentence."
    )


def build_messages(inputs: dict) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _render_user_prompt(inputs)},
    ]


def build_input_hash(inputs: dict) -> str:
    return _canonical_hash(inputs)


import sys as _sys
register(_sys.modules[__name__])
