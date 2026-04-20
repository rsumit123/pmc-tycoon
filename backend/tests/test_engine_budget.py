import pytest

from app.engine.budget import (
    BUCKETS,
    compute_quarterly_grant,
    default_allocation,
    normalize_allocation,
    validate_allocation,
    AllocationError,
)


def test_buckets_are_the_five_named_in_spec():
    assert BUCKETS == ["rd", "acquisition", "om", "spares", "infrastructure"]


def test_default_allocation_sums_to_grant():
    alloc = default_allocation(155000)
    assert sum(alloc.values()) == 155000
    for b in BUCKETS:
        assert b in alloc


def test_default_allocation_uses_documented_percentages():
    alloc = default_allocation(100000)
    assert alloc["rd"] == 25000
    assert alloc["acquisition"] == 35000
    assert alloc["om"] == 20000
    assert alloc["spares"] == 15000
    assert alloc["infrastructure"] == 5000


def test_normalize_returns_default_when_none():
    assert normalize_allocation(None, 100000) == default_allocation(100000)


def test_normalize_returns_input_when_valid():
    explicit = {"rd": 10000, "acquisition": 10000, "om": 10000, "spares": 10000, "infrastructure": 10000}
    assert normalize_allocation(explicit, 50000) == explicit


def test_validate_rejects_missing_bucket():
    bad = {"rd": 10000, "acquisition": 10000, "om": 10000, "spares": 10000}  # no infrastructure
    with pytest.raises(AllocationError):
        validate_allocation(bad, available_cr=100000)


def test_validate_rejects_negative_amount():
    bad = {"rd": -1, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0}
    with pytest.raises(AllocationError):
        validate_allocation(bad, available_cr=100000)


def test_validate_rejects_overspend():
    over = {"rd": 100000, "acquisition": 100000, "om": 0, "spares": 0, "infrastructure": 0}
    with pytest.raises(AllocationError):
        validate_allocation(over, available_cr=150000)


def test_validate_accepts_underspend():
    under = {"rd": 10000, "acquisition": 10000, "om": 10000, "spares": 10000, "infrastructure": 10000}
    validate_allocation(under, available_cr=100000)  # no raise


def test_compute_grant_realistic_2026():
    assert compute_quarterly_grant("realistic", 2026) == 45000


def test_compute_grant_difficulty_multipliers_2026():
    assert compute_quarterly_grant("relaxed",   2026) == 67500
    assert compute_quarterly_grant("realistic", 2026) == 45000
    assert compute_quarterly_grant("hard_peer", 2026) == 31500
    assert compute_quarterly_grant("worst_case", 2026) == 22500


def test_compute_grant_year_over_year_growth():
    # 3% compounded per year past 2026, rounded to nearest 500
    assert compute_quarterly_grant("realistic", 2026) == 45000
    # 45000 * 1.03 = 46350 → rounded to nearest 500 → 46500
    assert compute_quarterly_grant("realistic", 2027) == 46500
    # 45000 * 1.03^4 ≈ 50648 → rounded to nearest 500 → 50500
    assert compute_quarterly_grant("realistic", 2030) == 50500


def test_compute_grant_unknown_difficulty_defaults_realistic():
    assert compute_quarterly_grant("whatever", 2026) == 45000
