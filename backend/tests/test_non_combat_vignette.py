"""Non-combat vignettes resolve by commitment heuristic, not BVR combat."""
from app.engine.vignette.non_combat import resolve_non_combat, is_non_combat


def test_is_non_combat_detects_noncombat_kinds():
    for kind in ("escort_intercept", "sar_recovery", "show_of_force"):
        assert is_non_combat({"kind": kind, "success_threshold": {}}) is True
    for kind in ("defend_airspace", "defeat_strike", "air_superiority"):
        assert is_non_combat({"kind": kind, "success_threshold": {}}) is False


def test_escort_intercept_clean_success():
    ps = {
        "objective": {"kind": "escort_intercept", "success_threshold": {"escort_clean": True}},
        "adversary_force": [{"faction": "PAF", "count": 2, "platform_id": "f16_blk52", "role": "CAP"}],
    }
    commit = {"squadrons": [{"squadron_id": 1, "airframes": 4}],
              "support": {"awacs": True, "tanker": False, "sead_package": False},
              "roe": "visual_id_required"}
    outcome, trace = resolve_non_combat(ps, commit)
    assert outcome["objective_met"] is True
    assert outcome["ind_kia"] == 0
    assert outcome["adv_kia"] == 0
    assert any(e["kind"] == "escort_complete" for e in trace)


def test_escort_intercept_no_commit_fails():
    ps = {
        "objective": {"kind": "escort_intercept", "success_threshold": {"escort_clean": True}},
        "adversary_force": [],
    }
    commit = {"squadrons": [], "support": {"awacs": False, "tanker": False, "sead_package": False},
              "roe": "weapons_tight"}
    outcome, _ = resolve_non_combat(ps, commit)
    assert outcome["objective_met"] is False


def test_sar_requires_awacs():
    ps = {"objective": {"kind": "sar_recovery", "success_threshold": {"awacs_committed": True}},
          "adversary_force": []}
    commit_no = {"squadrons": [{"squadron_id": 1, "airframes": 2}],
                 "support": {"awacs": False, "tanker": False, "sead_package": False}, "roe": "weapons_tight"}
    commit_yes = {"squadrons": [{"squadron_id": 1, "airframes": 2}],
                  "support": {"awacs": True, "tanker": False, "sead_package": False}, "roe": "weapons_tight"}
    o_no, _ = resolve_non_combat(ps, commit_no)
    o_yes, _ = resolve_non_combat(ps, commit_yes)
    assert o_no["objective_met"] is False
    assert o_yes["objective_met"] is True


def test_show_of_force_requires_min_airframes():
    ps = {"objective": {"kind": "show_of_force", "success_threshold": {"airframes_committed_min": 6}},
          "adversary_force": []}
    commit_small = {"squadrons": [{"squadron_id": 1, "airframes": 4}],
                    "support": {"awacs": False, "tanker": False, "sead_package": False}, "roe": "weapons_tight"}
    commit_big = {"squadrons": [{"squadron_id": 1, "airframes": 6}, {"squadron_id": 2, "airframes": 4}],
                  "support": {"awacs": False, "tanker": False, "sead_package": False}, "roe": "weapons_tight"}
    o_small, _ = resolve_non_combat(ps, commit_small)
    o_big, _ = resolve_non_combat(ps, commit_big)
    assert o_small["objective_met"] is False
    assert o_big["objective_met"] is True
