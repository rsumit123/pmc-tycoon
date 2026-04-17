"""Tests for expanded intel templates and adversary roadmap."""
from app.content.loader import load_intel_templates, load_adversary_roadmap
from pathlib import Path


def test_intel_template_count():
    templates = load_intel_templates(Path("content/intel_templates.yaml"))
    assert len(templates) >= 22


def test_adversary_roadmap_chronological():
    events = load_adversary_roadmap(Path("content/adversary_roadmap.yaml"))
    for i in range(1, len(events)):
        prev = (events[i - 1].year, events[i - 1].quarter)
        curr = (events[i].year, events[i].quarter)
        assert curr >= prev, f"Event {i} out of order: {prev} > {curr}"


def test_roadmap_covers_full_campaign():
    events = load_adversary_roadmap(Path("content/adversary_roadmap.yaml"))
    years = {e.year for e in events}
    for y in range(2026, 2037):
        assert y in years, f"Year {y} has no adversary events"


def test_all_factions_represented():
    events = load_adversary_roadmap(Path("content/adversary_roadmap.yaml"))
    factions = {e.faction for e in events}
    assert "PLAAF" in factions
    assert "PAF" in factions
    assert "PLAN" in factions
