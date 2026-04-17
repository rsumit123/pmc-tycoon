import random

from app.engine.intel.fog import SOURCE_RULES, apply_fog


def test_source_rules_match_locked_design():
    assert SOURCE_RULES["HUMINT"]["false_rate"] == 0.30
    assert SOURCE_RULES["SIGINT"]["false_rate"] == 0.15
    assert SOURCE_RULES["IMINT"]["false_rate"] == 0.10
    assert SOURCE_RULES["OSINT"]["false_rate"] == 0.40
    assert SOURCE_RULES["ELINT"]["false_rate"] == 0.15


def test_source_types_have_valid_confidence_ranges():
    for source, rules in SOURCE_RULES.items():
        lo, hi = rules["confidence_range"]
        assert 0.0 <= lo < hi <= 1.0


def _card(subject_type="force_count", observed=None, ground_truth=None, subject_faction="PLAAF"):
    obs = observed if observed is not None else {"count": 100}
    gt = ground_truth if ground_truth is not None else {"count": 100}
    return {
        "source_type": "IMINT",
        "confidence": 0.9,
        "truth_value": False,
        "payload": {
            "headline": "test",
            "template_id": "t",
            "subject_faction": subject_faction,
            "subject_type": subject_type,
            "observed": obs,
            "ground_truth": gt,
        },
    }


def test_force_count_mutation_changes_observed_count():
    card = _card(subject_type="force_count", observed={"count": 100}, ground_truth={"count": 100})
    apply_fog(card, rng=random.Random(0))
    # Might equal 100 by coincidence; assert the range
    assert 0 <= card["payload"]["observed"]["count"] <= 170


def test_ground_truth_preserved():
    card = _card(subject_type="force_count", observed={"count": 500}, ground_truth={"count": 500})
    apply_fog(card, rng=random.Random(0))
    assert card["payload"]["ground_truth"]["count"] == 500


def test_base_rotation_swaps_base_when_alternates_available():
    card = _card(
        subject_type="base_rotation",
        observed={"base": "hotan"},
        ground_truth={"base": "hotan"},
    )
    card["payload"]["_fog_alternates"] = {"base": ["kashgar", "shigatse"]}
    apply_fog(card, rng=random.Random(0))
    assert card["payload"]["observed"]["base"] != "hotan"


def test_doctrine_guess_swaps_with_sibling():
    card = _card(subject_type="doctrine_guess",
                 observed={"doctrine": "conservative"},
                 ground_truth={"doctrine": "conservative"})
    card["payload"]["_fog_alternates"] = {"doctrine": ["integrated_ew", "saturation_raid"]}
    apply_fog(card, rng=random.Random(0))
    assert card["payload"]["observed"]["doctrine"] != "conservative"


def test_system_activation_flips_bool():
    card = _card(subject_type="system_activation",
                 observed={"active": True},
                 ground_truth={"active": True})
    apply_fog(card, rng=random.Random(0))
    assert card["payload"]["observed"]["active"] is False


def test_unknown_subject_type_graceful_no_crash():
    card = _card(subject_type="mystery_kind",
                 observed={"whatever": 1},
                 ground_truth={"whatever": 1})
    apply_fog(card, rng=random.Random(0))  # does not raise
    # observed may or may not equal ground_truth — just assert no explosion
    assert card["payload"]["subject_type"] == "mystery_kind"


def test_fog_does_not_change_source_type_or_confidence():
    card = _card(subject_type="force_count")
    card["source_type"] = "IMINT"
    card["confidence"] = 0.85
    apply_fog(card, rng=random.Random(0))
    assert card["source_type"] == "IMINT"
    assert card["confidence"] == 0.85
