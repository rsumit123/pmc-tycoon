import random

from app.content.loader import RoadmapEvent, RoadmapEffect
from app.engine.adversary.tick import tick_adversary
from app.engine.adversary.state import empty_state


def _plaaf_state():
    s = empty_state()
    s["inventory"] = {"j20a": 500}
    s["forward_bases"] = ["hotan"]
    s["active_systems"] = []
    return s


def _event(year=2026, quarter=3, faction="PLAAF", kind="inventory_delta", payload=None):
    return RoadmapEvent(
        year=year, quarter=quarter, faction=faction,
        effect=RoadmapEffect(kind=kind, payload=payload),
    )


def test_inventory_delta_adds_to_existing_count():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="inventory_delta", payload={"j20a": 60})
    out, events = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["inventory"]["j20a"] == 560


def test_inventory_delta_creates_new_unit_type():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="inventory_delta", payload={"j36_prototype": 2})
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["inventory"]["j36_prototype"] == 2


def test_inventory_delta_clamps_to_zero():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="inventory_delta", payload={"j20a": -1000})
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["inventory"]["j20a"] == 0


def test_system_activate_adds_to_active_systems():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="system_activate", payload="pl17_widespread")
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert "pl17_widespread" in out["PLAAF"]["active_systems"]


def test_system_activate_is_idempotent():
    states = {"PLAAF": _plaaf_state()}
    states["PLAAF"]["active_systems"] = ["pl17_widespread"]
    event = _event(kind="system_activate", payload="pl17_widespread")
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["active_systems"].count("pl17_widespread") == 1


def test_system_deactivate_removes():
    states = {"PLAAF": _plaaf_state()}
    states["PLAAF"]["active_systems"] = ["legacy_radar"]
    event = _event(kind="system_deactivate", payload="legacy_radar")
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert "legacy_radar" not in out["PLAAF"]["active_systems"]


def test_base_activate_adds_and_is_idempotent():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="base_activate", payload="shigatse_heavy")
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert "shigatse_heavy" in out["PLAAF"]["forward_bases"]


def test_doctrine_override_sets_directly():
    states = {"PLAAF": _plaaf_state()}
    states["PLAAF"]["doctrine"] = "conservative"
    event = _event(kind="doctrine_override", payload="saturation_raid")
    out, _ = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["doctrine"] == "saturation_raid"


def test_unknown_effect_kind_raises():
    import pytest
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="nuke_from_orbit", payload="just_to_be_sure")
    with pytest.raises(ValueError):
        tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))


def test_only_events_matching_year_quarter_are_applied():
    states = {"PLAAF": _plaaf_state()}
    events = [
        _event(year=2026, quarter=3, kind="inventory_delta", payload={"j20a": 10}),  # matches
        _event(year=2026, quarter=4, kind="inventory_delta", payload={"j20a": 10}),  # later
        _event(year=2026, quarter=2, kind="inventory_delta", payload={"j20a": 10}),  # earlier
    ]
    out, _ = tick_adversary(states, events, year=2026, quarter=3, rng=random.Random(0))
    assert out["PLAAF"]["inventory"]["j20a"] == 510


def test_emits_adversary_roadmap_event_applied():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="inventory_delta", payload={"j20a": 10})
    _, events_out = tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert any(e["event_type"] == "adversary_roadmap_event_applied" for e in events_out)


def test_input_states_not_mutated():
    states = {"PLAAF": _plaaf_state()}
    event = _event(kind="inventory_delta", payload={"j20a": 10})
    tick_adversary(states, [event], year=2026, quarter=3, rng=random.Random(0))
    assert states["PLAAF"]["inventory"]["j20a"] == 500  # unchanged
