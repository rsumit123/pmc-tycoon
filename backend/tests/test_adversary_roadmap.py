from pathlib import Path
from app.content.loader import load_adversary_roadmap


def test_roadmap_loads_events():
    events = load_adversary_roadmap(Path("content/adversary_roadmap.yaml"))
    assert len(events) >= 20


def test_every_event_has_required_fields():
    events = load_adversary_roadmap(Path("content/adversary_roadmap.yaml"))
    for e in events:
        assert e.year in range(2026, 2037)
        assert e.quarter in (1, 2, 3, 4)
        assert e.faction in ("PLAAF", "PAF", "PLAN")
        assert e.effect.kind in {
            "inventory_delta", "system_activate", "system_deactivate",
            "base_activate", "base_deactivate", "doctrine_override",
        }


def test_paf_j35e_first_tranche_event_exists():
    events = load_adversary_roadmap(Path("content/adversary_roadmap.yaml"))
    j35e_events = [
        e for e in events
        if e.faction == "PAF"
        and e.effect.kind == "inventory_delta"
        and isinstance(e.effect.payload, dict)
        and "j35e" in e.effect.payload
    ]
    assert j35e_events, "expected at least one PAF J-35E delivery event"


def test_events_are_chronologically_sortable():
    events = load_adversary_roadmap(Path("content/adversary_roadmap.yaml"))
    keys = [(e.year, e.quarter) for e in events]
    assert keys == sorted(keys), "roadmap events must be YAML-sorted chronologically"


def test_registry_caches_roadmap():
    from app.content.registry import adversary_roadmap
    a = adversary_roadmap()
    b = adversary_roadmap()
    assert a is b
