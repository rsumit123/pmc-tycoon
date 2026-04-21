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
        # Non-combat templates (escort_intercept, sar_recovery, show_of_force) may have
        # empty adversary rosters — they resolve via the non-combat resolver, not BVR.
        NON_COMBAT_KINDS = {"escort_intercept", "sar_recovery", "show_of_force"}
        if t.objective["kind"] not in NON_COMBAT_KINDS:
            assert t.adversary_roster, f"{t.id} must have at least one roster entry"
        assert t.objective["kind"] in {
            "defend_airspace", "defeat_strike", "escort_carrier", "suppress_ad",
            "escort_intercept", "sar_recovery", "show_of_force",
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


def test_ao_base_candidates_resolves_to_real_base():
    """A scenario with ao_base_candidates must resolve AO near one of the
    candidate bases' coords (with ±5 km jitter)."""
    import random
    from app.content.loader import ScenarioTemplate
    from app.engine.vignette.generator import _resolve_ao

    tpl = ScenarioTemplate(
        id="test_candidates", name="Test",
        ao={}, response_clock_minutes=30,
        q_index_min=0, q_index_max=39, weight=1.0,
        requires={}, adversary_roster=[],
        allowed_ind_roles=["CAP"], roe_options=["weapons_free"],
        objective={"kind": "defend_airspace", "success_threshold": {}},
        ao_base_candidates=("pathankot", "adampur"),
    )
    bases_registry = {
        1: {"template_id": "pathankot", "name": "Pathankot",
            "lat": 32.23, "lon": 75.63},
        2: {"template_id": "adampur", "name": "Adampur",
            "lat": 31.43, "lon": 75.75},
        3: {"template_id": "bagdogra", "name": "Bagdogra",
            "lat": 26.68, "lon": 88.33},
    }
    # Deterministic — run 10 times with different seeds; every AO must be
    # within ~0.1° (~11 km) of one of the two candidate bases.
    for seed in range(10):
        rng = random.Random(seed)
        ao = _resolve_ao(tpl, bases_registry, rng)
        near_pathankot = abs(ao["lat"] - 32.23) < 0.1 and abs(ao["lon"] - 75.63) < 0.1
        near_adampur = abs(ao["lat"] - 31.43) < 0.1 and abs(ao["lon"] - 75.75) < 0.1
        assert near_pathankot or near_adampur, f"AO {ao} not near candidates (seed={seed})"


def test_ao_base_candidates_fallback_when_none_seeded():
    """If none of the candidates are in the campaign's bases_registry, fall
    back to template.ao (or a default) rather than crashing."""
    import random
    from app.content.loader import ScenarioTemplate
    from app.engine.vignette.generator import _resolve_ao

    tpl = ScenarioTemplate(
        id="test_fallback", name="Test",
        ao={"region": "x", "name": "fallback", "lat": 20.0, "lon": 80.0},
        response_clock_minutes=30,
        q_index_min=0, q_index_max=39, weight=1.0,
        requires={}, adversary_roster=[],
        allowed_ind_roles=["CAP"], roe_options=["weapons_free"],
        objective={"kind": "defend_airspace", "success_threshold": {}},
        ao_base_candidates=("nonexistent_base",),
    )
    rng = random.Random(0)
    ao = _resolve_ao(tpl, {}, rng)
    assert ao["lat"] == 20.0 and ao["lon"] == 80.0


def test_roster_entries_have_required_fields():
    tpls = load_scenario_templates(Path("content/scenario_templates.yaml"))
    for t in tpls:
        for r in t.adversary_roster:
            assert r["role"] in {"CAP", "SEAD", "strike", "awacs", "tanker"}
            assert r["faction"] in {"PLAAF", "PAF", "PLAN"}
            assert r["platform_pool"]
            lo, hi = r["count_range"]
            assert 0 <= lo <= hi
