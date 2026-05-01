"""Budget allocation: 5-bucket math, defaults, validation.

Allocation is a dict mapping bucket name -> absolute cr. Engine modules
read these absolute amounts (not percentages). The orchestrator deducts
allocated amounts from the campaign treasury.
"""

from __future__ import annotations

BUCKETS: list[str] = ["rd", "acquisition", "om", "spares", "infrastructure"]

BASE_QUARTERLY_GRANT_CR = 45000

DIFFICULTY_GRANT_MULTIPLIER: dict[str, float] = {
    "relaxed":    1.5,
    "realistic":  1.0,
    "hard_peer":  0.7,
    "worst_case": 0.5,
}

# Defense-spending compounds ~3%/yr in line with India's long-run capex growth.
YOY_GRANT_GROWTH = 0.03


def compute_quarterly_grant(
    difficulty: str,
    current_year: int,
    base: int = BASE_QUARTERLY_GRANT_CR,
    *,
    faction_tiers: dict[str, str] | None = None,
) -> int:
    mult = DIFFICULTY_GRANT_MULTIPLIER.get(difficulty, 1.0)
    years_past_start = max(0, current_year - 2026)
    raw = base * mult * (1 + YOY_GRANT_GROWTH) ** years_past_start
    base_grant = int(round(raw / 500) * 500)
    if not faction_tiers:
        return base_grant
    # Plan 22 — war-footing bump from per-faction temperature.
    from app.engine.diplomacy import grant_multiplier_pct
    bump_pct = grant_multiplier_pct(faction_tiers)
    if bump_pct == 0:
        return base_grant
    scaled = base_grant * (100 + bump_pct) / 100
    return int(round(scaled / 500) * 500)

DEFAULT_PCT: dict[str, int] = {
    "rd": 25,
    "acquisition": 35,
    "om": 20,
    "spares": 15,
    "infrastructure": 5,
}


class AllocationError(ValueError):
    pass


def default_allocation(grant_cr: int) -> dict[str, int]:
    """Return the default split of `grant_cr` across the 5 buckets."""
    return {b: grant_cr * DEFAULT_PCT[b] // 100 for b in BUCKETS}


def normalize_allocation(allocation: dict[str, int] | None, grant_cr: int) -> dict[str, int]:
    """Return `allocation` if provided, otherwise `default_allocation(grant_cr)`."""
    if allocation is None:
        return default_allocation(grant_cr)
    return allocation


def validate_allocation(allocation: dict[str, int], available_cr: int) -> None:
    """Raise AllocationError if invalid: missing buckets, negative amounts, or overspend."""
    missing = [b for b in BUCKETS if b not in allocation]
    if missing:
        raise AllocationError(f"missing buckets: {missing}")
    extra = [k for k in allocation if k not in BUCKETS]
    if extra:
        raise AllocationError(f"unknown buckets: {extra}")
    for b, v in allocation.items():
        if not isinstance(v, int) or v < 0:
            raise AllocationError(f"bucket {b!r} must be a non-negative int (got {v!r})")
    total = sum(allocation.values())
    if total > available_cr:
        raise AllocationError(f"allocation total {total} exceeds available {available_cr}")
