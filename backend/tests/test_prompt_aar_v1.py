from app.llm.prompts import aar_v1, input_hash


SAMPLE_INPUTS = {
    "scenario_name": "LAC Air Incursion (Limited)",
    "ao": {"region": "lac_western", "name": "Ladakh / Pangong sector"},
    "year": 2028, "quarter": 3,
    "planning_state": {
        "adversary_force": [
            {"role": "CAP", "faction": "PLAAF", "platform_id": "j20a", "count": 6},
        ],
    },
    "committed_force": {
        "squadrons": [{"squadron_id": 17, "name": "17 Sqn Golden Arrows",
                       "platform_id": "rafale_f4", "airframes": 8}],
        "support": {"awacs": True, "tanker": True, "sead_package": False},
        "roe": "weapons_free",
    },
    "outcome": {"ind_kia": 0, "adv_kia": 4, "ind_airframes_lost": 1,
                "adv_airframes_lost": 4, "objective_met": True,
                "aar_stub": "Decisive IAF win."},
    "event_trace": [
        {"t_min": 0, "kind": "detection", "side": "IND", "detail": "AWACS paints bogeys"},
        {"t_min": 3, "kind": "bvr_launch", "side": "IND", "detail": "Meteor salvo"},
    ],
}


def test_aar_v1_module_metadata():
    assert aar_v1.KIND == "aar"
    assert aar_v1.VERSION == "v1"


def test_aar_v1_build_messages_shape():
    msgs = aar_v1.build_messages(SAMPLE_INPUTS)
    assert isinstance(msgs, list) and len(msgs) >= 2
    assert msgs[0]["role"] == "system"
    assert msgs[-1]["role"] == "user"
    user_content = msgs[-1]["content"]
    assert "LAC Air Incursion" in user_content
    assert "17 Sqn Golden Arrows" in user_content
    assert "weapons_free" in user_content
    assert "bvr_launch" in user_content


def test_aar_v1_input_hash_is_stable_and_shape_sensitive():
    h1 = aar_v1.build_input_hash(SAMPLE_INPUTS)
    h2 = aar_v1.build_input_hash(SAMPLE_INPUTS)
    assert h1 == h2
    mutated = {**SAMPLE_INPUTS, "year": 2029}
    assert aar_v1.build_input_hash(mutated) != h1


def test_aar_v1_registered():
    from app.llm.prompts import REGISTRY
    assert "aar:v1" in REGISTRY
