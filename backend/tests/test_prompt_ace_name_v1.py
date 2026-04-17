from app.llm.prompts import ace_name_v1


SAMPLE = {
    "squadron_name": "17 Sqn Golden Arrows",
    "platform_id": "rafale_f4",
    "vignette": {
        "scenario_name": "LAC Air Incursion (Limited)",
        "year": 2029, "quarter": 2,
        "outcome": {"adv_kia": 5, "ind_airframes_lost": 0},
    },
}


def test_metadata():
    assert ace_name_v1.KIND == "ace_name"
    assert ace_name_v1.VERSION == "v1"


def test_build_messages_has_format_constraint():
    msgs = ace_name_v1.build_messages(SAMPLE)
    sys_prompt = msgs[0]["content"]
    assert "callsign" in sys_prompt.lower()
    # Must tell model output is a single line only
    assert "one line" in sys_prompt.lower() or "single line" in sys_prompt.lower()
    user = msgs[-1]["content"]
    assert "17 Sqn Golden Arrows" in user
    assert "rafale_f4" in user


def test_hash_stable():
    h = ace_name_v1.build_input_hash(SAMPLE)
    assert len(h) == 64
