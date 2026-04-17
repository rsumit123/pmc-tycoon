"""Tests for expanded platform content + PlatformSpec schema changes."""
import pytest
from app.content.loader import load_platforms
from app.engine.vignette.bvr import PLATFORM_LOADOUTS
from pathlib import Path


def test_platform_count():
    platforms = load_platforms(Path("content/platforms.yaml"))
    assert len(platforms) >= 38, f"Expected >=38 platforms, got {len(platforms)}"


def test_procurable_by_field():
    platforms = load_platforms(Path("content/platforms.yaml"))
    ind_procurable = [p for p in platforms.values() if "IND" in p.procurable_by]
    assert len(ind_procurable) >= 15, "At least 15 platforms should be procurable by IND"
    adversary_only = [p for p in platforms.values() if len(p.procurable_by) == 0]
    assert len(adversary_only) >= 10, "At least 10 adversary-only platforms"


def test_delivery_window_defaults():
    platforms = load_platforms(Path("content/platforms.yaml"))
    rafale = platforms["rafale_f4"]
    assert rafale.default_first_delivery_quarters == 6
    assert rafale.default_foc_quarters == 20


def test_all_scenario_platforms_exist():
    """Every platform_id in scenario templates must exist in platforms.yaml."""
    from app.content.loader import load_scenario_templates
    platforms = load_platforms(Path("content/platforms.yaml"))
    templates = load_scenario_templates(Path("content/scenario_templates.yaml"))
    missing = set()
    for t in templates:
        for roster in t.adversary_roster:
            for pid in roster["platform_pool"]:
                if pid not in platforms and pid not in PLATFORM_LOADOUTS:
                    missing.add(pid)
    assert not missing, f"Platforms in scenarios but not in platforms.yaml or PLATFORM_LOADOUTS: {missing}"


def test_all_combat_platforms_have_loadouts():
    """Every platform that appears in scenario rosters must have a PLATFORM_LOADOUTS entry."""
    from app.content.loader import load_scenario_templates
    templates = load_scenario_templates(Path("content/scenario_templates.yaml"))
    missing = set()
    for t in templates:
        for roster in t.adversary_roster:
            for pid in roster["platform_pool"]:
                if pid not in PLATFORM_LOADOUTS:
                    missing.add(pid)
    assert not missing, f"Platforms in scenarios missing PLATFORM_LOADOUTS: {missing}"


def test_rcs_bands_valid():
    platforms = load_platforms(Path("content/platforms.yaml"))
    valid = {"VLO", "LO", "reduced", "conventional", "large"}
    for p in platforms.values():
        assert p.rcs_band in valid, f"{p.id} has invalid rcs_band: {p.rcs_band}"
