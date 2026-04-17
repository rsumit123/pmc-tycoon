from app.llm.prompts import year_recap_v1


SAMPLE = {
    "year": 2028,
    "starting_treasury_cr": 500000,
    "ending_treasury_cr": 410000,
    "acquisitions_delivered": ["Rafale sqn #2", "Tejas Mk1A batch-3"],
    "rd_milestones": ["AMCA Mk1 engine integration passed"],
    "vignettes_resolved": 2,
    "vignettes_won": 2,
    "notable_adversary_shifts": ["PLAAF fielded J-20S widely"],
}


def test_metadata():
    assert year_recap_v1.KIND == "year_recap"
    assert year_recap_v1.VERSION == "v1"


def test_one_line_constraint():
    msgs = year_recap_v1.build_messages(SAMPLE)
    assert "one sentence" in msgs[0]["content"].lower() \
        or "single sentence" in msgs[0]["content"].lower()


def test_hash_stable():
    assert year_recap_v1.build_input_hash(SAMPLE) \
        == year_recap_v1.build_input_hash(SAMPLE)
