"""Retrospective prompt v1 — end-of-campaign long-form assessment."""
from __future__ import annotations

import json

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "retrospective"
VERSION = "v1"

SYSTEM_PROMPT = """You are writing the Defense White Paper epilogue for
the outgoing Head of Defense Integration (2026-2036). Produce 5-8
paragraphs covering, in this order:
  1. Objective scorecard overview
  2. Force structure evolution
  3. Procurement / R&D highlights
  4. Notable engagements and emerging aces
  5. The adversary landscape as it now stands
  6. A frank assessment of what was left undone

Clipped, senior-officer voice. No dramatic language.
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    return (
        f"# Campaign: {inputs['final_year']}-Q{inputs['final_quarter']} final state\n\n"
        f"## Objective scorecard\n{json.dumps(inputs['objectives_scorecard'], indent=2)}\n\n"
        f"## Force structure delta\n{json.dumps(inputs['force_structure_delta'], indent=2)}\n\n"
        f"## Budget efficiency\n{inputs['budget_efficiency_pct']}%\n\n"
        f"## Emerging aces\n{inputs['ace_count']} squadron aces recognized\n\n"
        f"## Notable engagements\n{inputs['notable_engagements']}\n\n"
        f"## Adversary final state\n{json.dumps(inputs['adversary_final_state'], indent=2)}\n\n"
        "Write the retrospective now."
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
