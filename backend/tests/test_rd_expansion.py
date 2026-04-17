"""Tests for expanded R&D programs."""
from app.content.loader import load_rd_programs
from pathlib import Path

CONTENT = Path(__file__).parent.parent / "content"


def test_rd_program_count():
    programs = load_rd_programs(CONTENT / "rd_programs.yaml")
    assert len(programs) == 25


def test_all_programs_have_valid_cost():
    programs = load_rd_programs(CONTENT / "rd_programs.yaml")
    for p in programs.values():
        assert p.base_cost_cr > 0, f"{p.id} has zero cost"
        assert p.base_duration_quarters >= 4, f"{p.id} has duration < 4 quarters"


def test_no_duplicate_ids():
    programs = load_rd_programs(CONTENT / "rd_programs.yaml")
    assert len(programs) == 25, "Duplicate IDs in rd_programs.yaml"


def test_dependencies_reference_existing():
    programs = load_rd_programs(CONTENT / "rd_programs.yaml")
    for p in programs.values():
        for dep in p.dependencies:
            assert dep in programs, f"{p.id} depends on unknown program: {dep}"
