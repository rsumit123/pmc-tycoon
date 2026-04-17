"""Tests for expanded objectives content + evaluation."""
from app.content.loader import load_objectives
from pathlib import Path

_OBJECTIVES_PATH = Path(__file__).parent.parent / "content" / "objectives.yaml"


def test_objective_count():
    objectives = load_objectives(_OBJECTIVES_PATH)
    assert len(objectives) == 12


def test_all_objectives_have_weight():
    objectives = load_objectives(_OBJECTIVES_PATH)
    for o in objectives.values():
        assert o.weight >= 1, f"{o.id} has weight {o.weight}"


def test_all_objectives_have_target_year():
    objectives = load_objectives(_OBJECTIVES_PATH)
    for o in objectives.values():
        assert o.target_year is not None, f"{o.id} missing target_year"
        assert 2030 <= o.target_year <= 2036, f"{o.id} target_year {o.target_year} out of range"
