"""Cross-file content consistency tests."""
from pathlib import Path
import yaml
import pytest

from app.content.loader import (
    load_platforms, load_scenario_templates, load_adversary_roadmap,
    load_intel_templates, load_rd_programs, load_bases, load_objectives,
)
from app.engine.vignette.bvr import PLATFORM_LOADOUTS


CONTENT = Path("content")


def test_scenario_platforms_in_platforms_yaml():
    """Verify all platforms referenced in scenario templates exist in platforms.yaml."""
    platforms = load_platforms(CONTENT / "platforms.yaml")
    templates = load_scenario_templates(CONTENT / "scenario_templates.yaml")
    missing = set()
    for t in templates:
        for roster in t.adversary_roster:
            for pid in roster["platform_pool"]:
                if pid not in platforms:
                    missing.add(pid)
    assert not missing, f"Scenario platforms missing from platforms.yaml: {missing}"


def test_scenario_platforms_have_loadouts():
    """Verify all scenario platforms have weapons loadouts defined."""
    templates = load_scenario_templates(CONTENT / "scenario_templates.yaml")
    missing = set()
    for t in templates:
        for roster in t.adversary_roster:
            for pid in roster["platform_pool"]:
                if pid not in PLATFORM_LOADOUTS:
                    missing.add(pid)
    assert not missing, f"Scenario platforms missing PLATFORM_LOADOUTS: {missing}"


def test_roadmap_factions_valid():
    """Verify all faction names in adversary roadmap are valid."""
    events = load_adversary_roadmap(CONTENT / "adversary_roadmap.yaml")
    valid = {"PLAAF", "PAF", "PLAN"}
    for e in events:
        assert e.faction in valid, f"Unknown faction: {e.faction}"


def test_intel_template_factions_valid():
    """Verify all faction names in intel templates are valid."""
    templates = load_intel_templates(CONTENT / "intel_templates.yaml")
    valid = {"PLAAF", "PAF", "PLAN"}
    for t in templates:
        assert t.faction in valid, f"Unknown faction in intel template {t.id}: {t.faction}"


def test_no_duplicate_platform_ids():
    """Verify no duplicate platform IDs in platforms.yaml."""
    with open(CONTENT / "platforms.yaml") as f:
        data = yaml.safe_load(f)
    ids = [p["id"] for p in data["platforms"]]
    duplicates = [i for i in ids if ids.count(i) > 1]
    assert not duplicates, f"Duplicate platform IDs: {set(duplicates)}"


def test_no_duplicate_scenario_ids():
    """Verify no duplicate scenario IDs in scenario_templates.yaml."""
    templates = load_scenario_templates(CONTENT / "scenario_templates.yaml")
    ids = [t.id for t in templates]
    duplicates = [i for i in ids if ids.count(i) > 1]
    assert not duplicates, f"Duplicate scenario IDs: {set(duplicates)}"


def test_no_duplicate_objective_ids():
    """Verify no duplicate objective IDs in objectives.yaml."""
    objectives = load_objectives(CONTENT / "objectives.yaml")
    ids = list(objectives.keys())
    assert len(ids) == len(set(ids)), "Duplicate objective IDs"


def test_no_duplicate_rd_ids():
    """Verify no duplicate R&D program IDs in rd_programs.yaml."""
    programs = load_rd_programs(CONTENT / "rd_programs.yaml")
    ids = list(programs.keys())
    assert len(ids) == len(set(ids)), "Duplicate R&D program IDs"


def test_rd_dependencies_exist():
    """Verify all R&D program dependencies reference existing programs."""
    programs = load_rd_programs(CONTENT / "rd_programs.yaml")
    for p in programs.values():
        for dep in p.dependencies:
            assert dep in programs, f"{p.id} depends on unknown program: {dep}"


def test_bases_count():
    """Verify minimum bases are defined."""
    bases = load_bases(CONTENT / "bases.yaml")
    assert len(bases) >= 15, f"Expected at least 15 bases, got {len(bases)}"


def test_procurable_platforms_have_cost():
    """Verify all procurable platforms have positive cost."""
    platforms = load_platforms(CONTENT / "platforms.yaml")
    for p in platforms.values():
        if p.procurable_by:
            assert p.cost_cr > 0, f"Procurable platform {p.id} has zero cost"


def test_objectives_count():
    """Verify minimum objectives are defined."""
    objectives = load_objectives(CONTENT / "objectives.yaml")
    assert len(objectives) >= 12, f"Expected at least 12 objectives, got {len(objectives)}"


def test_rd_programs_count():
    """Verify minimum R&D programs are defined."""
    programs = load_rd_programs(CONTENT / "rd_programs.yaml")
    assert len(programs) >= 25, f"Expected at least 25 R&D programs, got {len(programs)}"


def test_scenario_templates_count():
    """Verify minimum scenario templates are defined."""
    templates = load_scenario_templates(CONTENT / "scenario_templates.yaml")
    assert len(templates) >= 20, f"Expected at least 20 scenario templates, got {len(templates)}"


def test_intel_templates_exist():
    """Verify intel templates are defined."""
    templates = load_intel_templates(CONTENT / "intel_templates.yaml")
    assert len(templates) > 0, "No intel templates loaded"


def test_adversary_roadmap_coverage():
    """Verify adversary roadmap has events across multiple quarters."""
    events = load_adversary_roadmap(CONTENT / "adversary_roadmap.yaml")
    assert len(events) > 0, "No adversary roadmap events loaded"
    quarters = {(e.year, e.quarter) for e in events}
    assert len(quarters) > 5, f"Expected roadmap coverage across multiple quarters, got {len(quarters)}"
