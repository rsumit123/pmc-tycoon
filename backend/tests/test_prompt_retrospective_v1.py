from app.llm.prompts import retrospective_v1


SAMPLE = {
    "final_year": 2036,
    "final_quarter": 1,
    "objectives_scorecard": [
        {"id": "obj1", "name": "Air superiority over LAC",
         "status": "met", "detail": "4 wins / 0 losses in LAC AO"},
    ],
    "force_structure_delta": {
        "squadrons_start": 31,
        "squadrons_end": 39,
        "fifth_gen_squadrons_end": 4,
    },
    "budget_efficiency_pct": 91,
    "ace_count": 6,
    "notable_engagements": ["2029-Q2 LAC air incursion victory"],
    "adversary_final_state": {
        "PLAAF": {"doctrine_tier": "C4I_integrated"},
    },
}


def test_metadata():
    assert retrospective_v1.KIND == "retrospective"
    assert retrospective_v1.VERSION == "v1"


def test_messages_cover_sections():
    msgs = retrospective_v1.build_messages(SAMPLE)
    user = msgs[-1]["content"]
    for marker in ("objective", "force structure", "adversary"):
        assert marker.lower() in user.lower()


def test_hash_stable():
    assert retrospective_v1.build_input_hash(SAMPLE) \
        == retrospective_v1.build_input_hash(SAMPLE)
