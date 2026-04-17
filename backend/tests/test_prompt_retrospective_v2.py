from app.llm.prompts import retrospective_v2

SAMPLE = {
    "final_year": 2036, "final_quarter": 2,
    "objectives_scorecard": [
        {"id": "amca_operational_by_2035", "name": "Operational AMCA Mk1 squadron by 2035",
         "status": "pass", "detail": ""}
    ],
    "force_structure_delta": {"squadrons_start": 31, "squadrons_end": 38, "fifth_gen_squadrons_end": 2},
    "budget_efficiency_pct": 87,
    "ace_count": 3,
    "notable_engagements": [{"scenario_name": "LAC Incursion", "year": 2031, "won": True}],
    "adversary_final_state": {"PLAAF": {"doctrine_tier": "advanced"}},
}


def test_metadata():
    assert retrospective_v2.KIND == "retrospective"
    assert retrospective_v2.VERSION == "v2"


def test_prompt_structure():
    msgs = retrospective_v2.build_messages(SAMPLE)
    assert len(msgs) == 2
    assert "White Paper" in msgs[0]["content"] or "retrospective" in msgs[0]["content"].lower()


def test_engagement_formatting():
    msgs = retrospective_v2.build_messages(SAMPLE)
    user_content = msgs[1]["content"]
    assert "- LAC Incursion (2031) — won" in user_content


def test_empty_engagements():
    inputs = {**SAMPLE, "notable_engagements": []}
    msgs = retrospective_v2.build_messages(inputs)
    user_content = msgs[1]["content"]
    assert "None recorded." in user_content


def test_lost_engagement_formatting():
    inputs = {**SAMPLE, "notable_engagements": [{"scenario_name": "Galwan Followup", "year": 2029, "won": False}]}
    msgs = retrospective_v2.build_messages(inputs)
    user_content = msgs[1]["content"]
    assert "— lost" in user_content


def test_hash_stable():
    assert retrospective_v2.build_input_hash(SAMPLE) == retrospective_v2.build_input_hash(SAMPLE)


def test_hash_differs_for_different_inputs():
    other = {**SAMPLE, "budget_efficiency_pct": 50}
    assert retrospective_v2.build_input_hash(SAMPLE) != retrospective_v2.build_input_hash(other)


def test_registered_in_registry():
    from app.llm.prompts import REGISTRY
    assert "retrospective:v2" in REGISTRY
