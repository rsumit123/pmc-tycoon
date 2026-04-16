"""Budget allocation: 5-bucket math, defaults, validation.

Allocation is a dict mapping bucket name -> absolute cr. Engine modules
read these absolute amounts (not percentages). The orchestrator deducts
allocated amounts from the campaign treasury.
"""

from __future__ import annotations

BUCKETS: list[str] = ["rd", "acquisition", "om", "spares", "infrastructure"]

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
