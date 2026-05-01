"""Pure-function diplomacy tick + supplier blocking + grant scaling.

Reads `app.content.registry.diplomacy()` for thresholds + drift values.
"""
from __future__ import annotations
from app.content.registry import diplomacy as _cfg


def tier_from_temperature(temp: int) -> str:
    cfg = _cfg()
    for tier, (lo, hi) in cfg.tier_bands.items():
        if lo <= temp <= hi:
            return tier
    return "neutral"


def tick_diplomacy_temp(current_temp: int, *, strikes_this_quarter: int) -> int:
    """Apply strike drops + drift toward neutral. Clamped to [0, 100]."""
    cfg = _cfg()
    drop = strikes_this_quarter * cfg.strike_temperature_drop
    new_temp = current_temp - drop
    if new_temp < 50:
        new_temp = min(50, new_temp + cfg.drift_per_quarter)
    elif new_temp > 50:
        new_temp = max(50, new_temp - cfg.drift_per_quarter)
    return max(0, min(100, new_temp))


def grant_multiplier_pct(faction_tiers: dict[str, str]) -> int:
    """Sum per-faction grant bumps, capped at the global cap."""
    cfg = _cfg()
    total = sum(cfg.grant_bump_pct.get(tier, 0) for tier in faction_tiers.values())
    return min(total, cfg.grant_bump_cap_pct)


def is_supplier_blocked(origin: str, faction_tiers: dict[str, str]) -> bool:
    """True if `origin` (e.g. CHN, PAK) is tied to a hostile-tier faction."""
    cfg = _cfg()
    target_faction = cfg.supplier_factions.get(origin)
    if target_faction is None:
        return False
    return faction_tiers.get(target_faction) == "hostile"
