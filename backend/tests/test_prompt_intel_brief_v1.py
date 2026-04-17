from app.llm.prompts import intel_brief_v1


SAMPLE = {
    "year": 2029, "quarter": 1,
    "adversary_states": {
        "PLAAF": {"doctrine_tier": "C4I_integrated",
                  "inventory": {"j20a": 320, "j20s": 80, "j16": 240},
                  "recent_events": ["J-20S two-seater IOC"]},
        "PAF":   {"doctrine_tier": "modernizing",
                  "inventory": {"j35e": 12, "jf17_blk3": 96},
                  "recent_events": ["First J-35E sqn raised"]},
        "PLAN":  {"doctrine_tier": "blue_water_aspirant",
                  "inventory": {"j35a": 24},
                  "recent_events": ["Fujian-class second hull trials"]},
    },
    "recent_intel_cards": [
        {"source_type": "SIGINT", "confidence": 0.7,
         "headline": "Chengdu assembly line ramp"},
    ],
}


def test_intel_brief_v1_metadata():
    assert intel_brief_v1.KIND == "intel_brief"
    assert intel_brief_v1.VERSION == "v1"


def test_intel_brief_v1_builds_messages():
    msgs = intel_brief_v1.build_messages(SAMPLE)
    assert msgs[0]["role"] == "system"
    user = msgs[-1]["content"]
    assert "PLAAF" in user and "PAF" in user and "PLAN" in user
    assert "Chengdu assembly line ramp" in user


def test_intel_brief_v1_input_hash_stable():
    h = intel_brief_v1.build_input_hash(SAMPLE)
    assert len(h) == 64
    assert h == intel_brief_v1.build_input_hash(SAMPLE)
