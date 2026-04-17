import random

from app.content.loader import IntelTemplate
from app.engine.intel.generator import generate_intel, is_template_eligible


def _tpl(id="tpl1", faction="PLAAF", source_types=None, subject_type="force_count",
         headline="{count} airframes", payload_keys=None, trigger=None):
    return IntelTemplate(
        id=id, faction=faction,
        source_types=source_types or ["IMINT"],
        headline_template=headline,
        subject_type=subject_type,
        payload_keys=payload_keys or {"count": {"source": "inventory", "key": "j20a"}},
        trigger=trigger,
    )


def _plaaf_state():
    return {
        "inventory": {"j20a": 500, "j35a": 50},
        "doctrine": "conservative",
        "active_systems": ["pl15_operational"],
        "forward_bases": ["hotan", "kashgar"],
    }


def test_generates_between_4_and_7_cards():
    states = {"PLAAF": _plaaf_state()}
    tpls = [_tpl(id=f"t{i}") for i in range(6)]
    cards, events = generate_intel(
        states, tpls, roadmap_events=[], year=2026, quarter=2, rng=random.Random(42),
    )
    assert 4 <= len(cards) <= 7


def test_generated_card_has_expected_payload_shape():
    states = {"PLAAF": _plaaf_state()}
    tpl = _tpl(
        id="t",
        payload_keys={"count": {"source": "inventory", "key": "j20a"}},
    )
    cards, _ = generate_intel(
        states, [tpl, tpl, tpl, tpl, tpl], roadmap_events=[],
        year=2026, quarter=2, rng=random.Random(0),
    )
    c = cards[0]
    assert c["source_type"] in ("HUMINT", "SIGINT", "IMINT", "OSINT", "ELINT")
    assert 0.0 <= c["confidence"] <= 1.0
    assert c["truth_value"] in (True, False)
    assert c["payload"]["subject_faction"] == "PLAAF"
    assert "observed" in c["payload"]
    assert "ground_truth" in c["payload"]


def test_eligibility_respects_min_inventory():
    state = _plaaf_state()
    tpl_ok = _tpl(id="ok", trigger={"min_inventory": {"j20a": 300}})
    tpl_no = _tpl(id="no", trigger={"min_inventory": {"j20a": 9999}})
    assert is_template_eligible(tpl_ok, "PLAAF", state)
    assert not is_template_eligible(tpl_no, "PLAAF", state)


def test_eligibility_respects_requires_system():
    state = _plaaf_state()
    tpl_has = _tpl(id="has", trigger={"requires_system": "pl15_operational"})
    tpl_missing = _tpl(id="missing", trigger={"requires_system": "pl17_widespread"})
    assert is_template_eligible(tpl_has, "PLAAF", state)
    assert not is_template_eligible(tpl_missing, "PLAAF", state)


def test_skips_template_when_forward_bases_empty_and_template_needs_base():
    state = _plaaf_state()
    state["forward_bases"] = []
    tpl = _tpl(
        id="needs_base",
        payload_keys={"base": {"source": "forward_bases", "pick": "random"}},
    )
    assert not is_template_eligible(tpl, "PLAAF", state)


def test_roadmap_intel_event_yields_additional_card():
    from app.content.loader import RoadmapEvent, RoadmapEffect, RoadmapIntel
    states = {"PAF": {"inventory": {"j35e": 4}, "doctrine": "conservative",
                      "active_systems": [], "forward_bases": ["sargodha"]}}
    roadmap_event = RoadmapEvent(
        year=2026, quarter=3, faction="PAF",
        effect=RoadmapEffect(kind="inventory_delta", payload={"j35e": 4}),
        intel=RoadmapIntel(
            headline="PAF receives first J-35E tranche",
            source_type="IMINT",
            confidence=0.92,
        ),
    )
    tpls = [_tpl(id=f"t{i}", faction="PAF",
                 payload_keys={"count": {"source": "inventory", "key": "j35e"}})
            for i in range(6)]
    cards, _ = generate_intel(
        states, tpls, roadmap_events=[roadmap_event],
        year=2026, quarter=3, rng=random.Random(0),
    )
    headlines = [c["payload"]["headline"] for c in cards]
    assert any("first J-35E tranche" in h for h in headlines)


def test_same_seed_produces_same_cards():
    states = {"PLAAF": _plaaf_state()}
    tpls = [_tpl(id=f"t{i}") for i in range(6)]
    cards_a, _ = generate_intel(
        states, tpls, roadmap_events=[], year=2026, quarter=2, rng=random.Random(77),
    )
    cards_b, _ = generate_intel(
        states, tpls, roadmap_events=[], year=2026, quarter=2, rng=random.Random(77),
    )
    # Compare headlines + observed payloads — they should be byte-identical
    assert [(c["source_type"], c["payload"]["headline"]) for c in cards_a] == \
           [(c["source_type"], c["payload"]["headline"]) for c in cards_b]


def test_emits_intel_underfilled_when_not_enough_templates():
    states = {"PLAAF": _plaaf_state()}
    tpls = [_tpl(id="only", trigger={"min_inventory": {"j20a": 9999}})]  # fails eligibility
    cards, events = generate_intel(
        states, tpls, roadmap_events=[], year=2026, quarter=2, rng=random.Random(0),
    )
    assert any(e["event_type"] == "intel_underfilled" for e in events)
    assert len(cards) < 4
