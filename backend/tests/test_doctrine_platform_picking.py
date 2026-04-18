"""Doctrine-aware platform picking should weight by role fitness, not just inventory."""
import random
from app.engine.vignette.generator import build_planning_state
from app.content.loader import ScenarioTemplate


def _make_template(role: str, pool: list[str]) -> ScenarioTemplate:
    return ScenarioTemplate(
        id="test_template",
        name="Test",
        ao={"region": "test", "name": "Test AO", "lat": 30.0, "lon": 80.0},
        response_clock_minutes=45,
        q_index_min=0,
        q_index_max=39,
        weight=1.0,
        requires={},
        adversary_roster=[
            {"role": role, "faction": "PLAAF", "platform_pool": pool, "count_range": [4, 4]},
        ],
        allowed_ind_roles=["CAP"],
        roe_options=["weapons_free"],
        objective={"kind": "defend_airspace", "success_threshold": {"adv_kills_min": 2, "ind_losses_max": 4}},
    )


def test_cap_role_prefers_stealth_platforms():
    template = _make_template("CAP", ["j20a", "j16"])
    adversary = {"PLAAF": {"inventory": {"j20a": 40, "j16": 200}}}
    picks = {}
    for i in range(200):
        rng = random.Random(i)
        ps = build_planning_state(template, adversary, rng)
        for unit in ps["adversary_force"]:
            picks[unit["platform_id"]] = picks.get(unit["platform_id"], 0) + 1
    j20a_pct = picks.get("j20a", 0) / sum(picks.values())
    assert j20a_pct > 0.40, f"J-20A picked {j20a_pct:.0%} — stealth should be favored for CAP"


def test_strike_role_prefers_bombers():
    template = _make_template("strike", ["h6kj", "j16"])
    adversary = {"PLAAF": {"inventory": {"h6kj": 30, "j16": 200}}}
    picks = {}
    for i in range(200):
        rng = random.Random(i)
        ps = build_planning_state(template, adversary, rng)
        for unit in ps["adversary_force"]:
            picks[unit["platform_id"]] = picks.get(unit["platform_id"], 0) + 1
    h6kj_pct = picks.get("h6kj", 0) / sum(picks.values())
    assert h6kj_pct > 0.35, f"H-6KJ picked {h6kj_pct:.0%} — bomber should be favored for strike"
