"""Pure-function base-damage decay.

Runs once per quarter inside advance_turn. Decays sub-system damage on every
adversary base toward fully repaired. Auto-repair window is 4 quarters
(25%/Q on shelter + 2/Q on garrison). AD batteries take 8 quarters to be
replaced/relocated by the adversary.

Player-paid rush is handled in a separate flow that just sets the relevant
field directly.
"""
from __future__ import annotations
from typing import Any

_SHELTER_REPAIR_PCT = 10
_GARRISON_REPAIR_PER_Q = 2
_AD_REPAIR_QUARTERS = 8


def tick_base_damage(state: dict[str, Any]) -> dict[str, Any]:
    out = dict(state)
    if out.get("shelter_loss_pct", 0) > 0:
        out["shelter_loss_pct"] = max(0, out["shelter_loss_pct"] - _SHELTER_REPAIR_PCT)
    if out.get("runway_disabled_quarters_remaining", 0) > 0:
        out["runway_disabled_quarters_remaining"] -= 1
    if out.get("garrisoned_loss", 0) > 0:
        out["garrisoned_loss"] = max(0, out["garrisoned_loss"] - _GARRISON_REPAIR_PER_Q)
    if out.get("ad_destroyed"):
        since = out.get("ad_destroyed_quarters_since", 0) + 1
        out["ad_destroyed_quarters_since"] = since
        if since > _AD_REPAIR_QUARTERS:
            out["ad_destroyed"] = False
            out["ad_destroyed_quarters_since"] = 0
    return out
