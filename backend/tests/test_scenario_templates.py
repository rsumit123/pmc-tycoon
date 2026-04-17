from pathlib import Path
from app.content.loader import load_scenario_templates


def test_templates_load():
    tpls = load_scenario_templates(Path("content/scenario_templates.yaml"))
    assert len(tpls) >= 8


def test_every_template_has_required_fields():
    tpls = load_scenario_templates(Path("content/scenario_templates.yaml"))
    for t in tpls:
        assert t.id
        assert t.name
        assert t.ao["lat"] and t.ao["lon"]
        assert 30 <= t.response_clock_minutes <= 180
        assert 0 <= t.q_index_min <= t.q_index_max <= 40
        assert t.weight > 0
        assert t.adversary_roster, f"{t.id} must have at least one roster entry"
        assert t.objective["kind"] in {
            "defend_airspace", "defeat_strike", "escort_carrier", "suppress_ad",
        }


def test_template_ids_are_unique():
    tpls = load_scenario_templates(Path("content/scenario_templates.yaml"))
    ids = [t.id for t in tpls]
    assert len(ids) == len(set(ids))


def test_registry_caches_templates():
    from app.content.registry import scenario_templates
    a = scenario_templates()
    b = scenario_templates()
    assert a is b


def test_roster_entries_have_required_fields():
    tpls = load_scenario_templates(Path("content/scenario_templates.yaml"))
    for t in tpls:
        for r in t.adversary_roster:
            assert r["role"] in {"CAP", "SEAD", "strike", "awacs", "tanker"}
            assert r["faction"] in {"PLAAF", "PAF", "PLAN"}
            assert r["platform_pool"]
            lo, hi = r["count_range"]
            assert 0 <= lo <= hi
