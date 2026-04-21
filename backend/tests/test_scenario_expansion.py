"""Tests for expanded scenario templates."""
from app.content.loader import load_scenario_templates, load_platforms
from app.engine.vignette.bvr import PLATFORM_LOADOUTS
from pathlib import Path


def test_scenario_count():
    templates = load_scenario_templates(Path("content/scenario_templates.yaml"))
    assert len(templates) == 27


def test_all_roster_platforms_have_loadouts():
    templates = load_scenario_templates(Path("content/scenario_templates.yaml"))
    missing = set()
    for t in templates:
        for roster in t.adversary_roster:
            for pid in roster["platform_pool"]:
                if pid not in PLATFORM_LOADOUTS:
                    missing.add(pid)
    assert not missing, f"Missing PLATFORM_LOADOUTS: {missing}"


def test_scenario_weight_positive():
    templates = load_scenario_templates(Path("content/scenario_templates.yaml"))
    for t in templates:
        assert t.weight > 0, f"{t.id} has non-positive weight"


def test_q_index_ranges_valid():
    templates = load_scenario_templates(Path("content/scenario_templates.yaml"))
    for t in templates:
        assert 0 <= t.q_index_min <= t.q_index_max <= 39, f"{t.id} has invalid q_index range"
