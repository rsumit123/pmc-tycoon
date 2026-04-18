"""Test projected-completion math for R&D."""
from app.engine.rd import project_completion


def test_standard_funding_completes_on_base_duration():
    result = project_completion(
        progress_pct=0,
        base_duration_quarters=16,
        base_cost_cr=8000,
        funding_level="standard",
        current_year=2026,
        current_quarter=2,
    )
    assert result["completion_year"] == 2030
    assert result["completion_quarter"] == 2
    assert result["quarterly_cost_cr"] == 500  # 8000 / 16


def test_accelerated_finishes_faster_costs_more():
    r = project_completion(
        progress_pct=0,
        base_duration_quarters=16,
        base_cost_cr=8000,
        funding_level="accelerated",
        current_year=2026,
        current_quarter=2,
    )
    assert r["quarters_remaining"] == 12  # 100% / (6.25% * 1.4) = 100 / 8.75 ≈ 11.43 → 12
    assert r["quarterly_cost_cr"] == 750  # (8000 / 16) * 1.5


def test_slow_finishes_later_costs_less():
    r = project_completion(
        progress_pct=0,
        base_duration_quarters=16,
        base_cost_cr=8000,
        funding_level="slow",
        current_year=2026,
        current_quarter=2,
    )
    assert r["quarters_remaining"] == 32  # 100% / (6.25% * 0.5) = 100 / 3.125 = 32
    assert r["quarterly_cost_cr"] == 250  # (8000 / 16) * 0.5


def test_partial_progress_reduces_remaining():
    r = project_completion(
        progress_pct=50,
        base_duration_quarters=16,
        base_cost_cr=8000,
        funding_level="standard",
        current_year=2026,
        current_quarter=2,
    )
    assert r["quarters_remaining"] == 8
    assert r["completion_year"] == 2028
    assert r["completion_quarter"] == 2


def test_year_quarter_rollover():
    """Test that quarters properly roll over to next year."""
    r = project_completion(
        progress_pct=0,
        base_duration_quarters=20,
        base_cost_cr=10000,
        funding_level="standard",
        current_year=2026,
        current_quarter=4,
    )
    # From 2026 Q4 + 20 quarters = lands in 2031 Q4
    assert r["completion_year"] == 2031
    assert r["completion_quarter"] == 4


def test_already_complete():
    """100% progress returns 0 quarters remaining."""
    r = project_completion(
        progress_pct=100,
        base_duration_quarters=16,
        base_cost_cr=8000,
        funding_level="standard",
        current_year=2026,
        current_quarter=2,
    )
    assert r["quarters_remaining"] == 0
