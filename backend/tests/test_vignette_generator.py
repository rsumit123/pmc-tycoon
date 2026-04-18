import random

from app.content.loader import ScenarioTemplate
from app.engine.vignette.generator import pick_scenario, build_planning_state, is_template_eligible


def _tpl(id="t1", q_index_min=0, q_index_max=39, weight=1.0,
         requires=None, roster=None):
    return ScenarioTemplate(
        id=id,
        name=id.upper(),
        ao={"region": "x", "name": "x", "lat": 34.0, "lon": 78.5},
        response_clock_minutes=45,
        q_index_min=q_index_min,
        q_index_max=q_index_max,
        weight=weight,
        requires=requires or {},
        adversary_roster=roster or [{
            "role": "CAP", "faction": "PLAAF",
            "platform_pool": ["j20a"], "count_range": [4, 6],
        }],
        allowed_ind_roles=["CAP"],
        roe_options=["weapons_free"],
        objective={"kind": "defend_airspace",
                   "success_threshold": {"adv_kills_min": 1, "ind_losses_max": 4}},
    )


def _plaaf_state(j20a=500):
    return {"inventory": {"j20a": j20a, "j35a": 20, "j16": 100},
            "doctrine": "conservative", "active_systems": [], "forward_bases": []}


def test_eligible_within_quarter_window():
    tpl = _tpl(q_index_min=0, q_index_max=20)
    assert is_template_eligible(tpl, {"PLAAF": _plaaf_state()}, year=2028, quarter=2)
    assert not is_template_eligible(tpl, {"PLAAF": _plaaf_state()}, year=2032, quarter=2)


def test_eligible_requires_min_inventory():
    tpl = _tpl(requires={"adversary_inventory": {"PLAAF": {"j20a": 1000}}})
    assert not is_template_eligible(tpl, {"PLAAF": _plaaf_state(j20a=500)},
                                    year=2028, quarter=2)
    assert is_template_eligible(tpl, {"PLAAF": _plaaf_state(j20a=1200)},
                                year=2028, quarter=2)


def test_eligible_requires_active_system():
    tpl = _tpl(requires={"adversary_active_system": "pl17_widespread"})
    plaaf = _plaaf_state()
    plaaf["active_systems"] = ["pl17_widespread"]
    assert is_template_eligible(tpl, {"PLAAF": plaaf}, year=2028, quarter=2)
    plaaf["active_systems"] = []
    assert not is_template_eligible(tpl, {"PLAAF": plaaf}, year=2028, quarter=2)


def test_pick_scenario_returns_none_when_no_eligible():
    tpls = [_tpl(q_index_min=35, q_index_max=39)]  # late-only
    picked = pick_scenario(tpls, {"PLAAF": _plaaf_state()},
                           year=2026, quarter=2, rng=random.Random(0))
    assert picked is None


def test_pick_scenario_returns_template_when_eligible():
    tpls = [_tpl(id="a", weight=1.0), _tpl(id="b", weight=1.0)]
    picked = pick_scenario(tpls, {"PLAAF": _plaaf_state()},
                           year=2028, quarter=2, rng=random.Random(0))
    assert picked is not None
    assert picked.id in {"a", "b"}


def test_pick_scenario_respects_weight():
    # a has weight 9, b has weight 1 → a should dominate
    tpls = [_tpl(id="a", weight=9.0), _tpl(id="b", weight=1.0)]
    counts = {"a": 0, "b": 0}
    for seed in range(500):
        p = pick_scenario(tpls, {"PLAAF": _plaaf_state()},
                          year=2028, quarter=2, rng=random.Random(seed))
        counts[p.id] += 1
    # a should be ~9x b; allow wide band for sample noise
    assert counts["a"] > 4 * counts["b"]


def test_build_planning_state_fills_adversary_force():
    tpl = _tpl(roster=[{
        "role": "CAP", "faction": "PLAAF",
        "platform_pool": ["j20a", "j35a"], "count_range": [4, 6],
    }])
    state = build_planning_state(tpl, {"PLAAF": _plaaf_state()},
                                 rng=random.Random(0))
    assert state["scenario_id"] == tpl.id
    assert state["ao"]["lat"] == 34.0
    assert len(state["adversary_force"]) == 1
    entry = state["adversary_force"][0]
    assert entry["role"] == "CAP"
    assert entry["platform_id"] in {"j20a", "j35a"}
    assert 4 <= entry["count"] <= 6
    assert "loadout" in entry  # populated from PLATFORM_LOADOUTS


def test_build_planning_state_skips_roster_entry_if_inventory_exhausted():
    # Platform pool has only j20a but faction inventory has 0
    tpl = _tpl(roster=[{
        "role": "CAP", "faction": "PLAAF",
        "platform_pool": ["j20a"], "count_range": [4, 6],
    }])
    plaaf = _plaaf_state(j20a=0)
    state = build_planning_state(tpl, {"PLAAF": plaaf}, rng=random.Random(0))
    assert state["adversary_force"] == []


def test_build_planning_state_is_deterministic():
    tpl = _tpl(roster=[{
        "role": "CAP", "faction": "PLAAF",
        "platform_pool": ["j20a", "j35a"], "count_range": [4, 6],
    }])
    s1 = build_planning_state(tpl, {"PLAAF": _plaaf_state()}, rng=random.Random(42))
    s2 = build_planning_state(tpl, {"PLAAF": _plaaf_state()}, rng=random.Random(42))
    assert s1 == s2


def test_build_planning_state_includes_intel_quality_and_awacs_covering():
    """New fields from Plan 13 Task 5."""
    tpl = _tpl(roster=[{
        "role": "CAP", "faction": "PLAAF",
        "platform_pool": ["j20a"], "count_range": [4, 6],
    }])
    ps = build_planning_state(
        tpl,
        {"PLAAF": _plaaf_state()},
        rng=random.Random(42),
        player_squadrons=[],
        bases_registry={},
        recent_intel_confidences=[],
    )

    assert "intel_quality" in ps
    assert "awacs_covering" in ps
    assert "adversary_force_observed" in ps
    assert ps["intel_quality"]["tier"] in ("low", "medium", "high", "perfect")
    assert isinstance(ps["awacs_covering"], list)
    assert isinstance(ps["adversary_force_observed"], list)
    # Ground-truth force still present for resolver
    assert "adversary_force" in ps


def test_build_planning_state_observed_force_matches_tier():
    """adversary_force_observed structure matches the intel quality tier."""
    tpl = _tpl(roster=[{
        "role": "CAP", "faction": "PLAAF",
        "platform_pool": ["j20a"], "count_range": [4, 6],
    }])
    # With no AWACS and no recent intel the score will be low (baseline 0.15,
    # j20a is VLO → stealth penalty → stays low).
    ps = build_planning_state(
        tpl,
        {"PLAAF": _plaaf_state()},
        rng=random.Random(42),
        player_squadrons=[],
        bases_registry={},
        recent_intel_confidences=[],
    )
    tier = ps["intel_quality"]["tier"]
    obs = ps["adversary_force_observed"]
    if tier == "perfect":
        # Each entry should be a plain copy with platform_id
        assert all("platform_id" in e for e in obs)
    elif tier == "high":
        assert all("probable_platforms" in e and e["fidelity"] == "high" for e in obs)
    elif tier == "medium":
        assert all("count_range" in e and e["fidelity"] == "medium" for e in obs)
    else:
        # low — single entry with count_range
        if obs:
            assert obs[0]["fidelity"] == "low"
            assert "count_range" in obs[0]
