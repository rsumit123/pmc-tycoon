from app.engine.adversary.doctrine import compute_doctrine, progress_doctrine


def test_plaaf_tier1_at_start():
    state = {"inventory": {"j20a": 500, "j35a": 20}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PLAAF", state, year=2026) == "conservative"


def test_plaaf_promotes_to_integrated_ew_when_thresholds_met():
    state = {"inventory": {"j20a": 680, "j35a": 100}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PLAAF", state, year=2028) == "integrated_ew"


def test_plaaf_does_not_promote_early_even_with_inventory():
    state = {"inventory": {"j20a": 1000, "j35a": 100}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PLAAF", state, year=2027) == "conservative"


def test_plaaf_promotes_to_saturation_raid_late():
    state = {"inventory": {"j20a": 800, "j35a": 200}, "doctrine": "integrated_ew",
             "active_systems": ["yj21_operational"], "forward_bases": []}
    assert compute_doctrine("PLAAF", state, year=2032) == "saturation_raid"


def test_paf_promotes_to_stealth_enabled_on_j35e_threshold():
    state = {"inventory": {"j35e": 20, "j10ce": 36}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PAF", state, year=2027) == "stealth_enabled"


def test_paf_promotes_to_integrated_high_low():
    state = {"inventory": {"j35e": 40, "j10ce": 36}, "doctrine": "stealth_enabled",
             "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PAF", state, year=2030) == "integrated_high_low"


def test_plan_promotes_to_far_seas_buildout_on_fujian_plus_year():
    state = {"inventory": {"fujian": 1, "liaoning": 1, "shandong": 1},
             "doctrine": "coastal_defense", "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PLAN", state, year=2028) == "far_seas_buildout"


def test_plan_promotes_to_global_power_projection_with_four_carriers():
    state = {"inventory": {"fujian": 1, "liaoning": 1, "shandong": 1, "type004_carrier": 1},
             "doctrine": "far_seas_buildout", "active_systems": [], "forward_bases": []}
    assert compute_doctrine("PLAN", state, year=2033) == "global_power_projection"


def test_doctrine_is_sticky_no_regression():
    # Already promoted even if inventory dips below threshold
    state = {"inventory": {"j20a": 100, "j35a": 0}, "doctrine": "saturation_raid",
             "active_systems": ["yj21_operational"], "forward_bases": []}
    assert compute_doctrine("PLAAF", state, year=2035) == "saturation_raid"


def test_progress_doctrine_emits_event_on_shift():
    state = {"inventory": {"j20a": 680, "j35a": 100}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    new_state, events = progress_doctrine("PLAAF", state, year=2028)
    assert new_state["doctrine"] == "integrated_ew"
    assert any(e["event_type"] == "adversary_doctrine_shifted" for e in events)


def test_progress_doctrine_no_event_when_unchanged():
    state = {"inventory": {"j20a": 500, "j35a": 20}, "doctrine": "conservative",
             "active_systems": [], "forward_bases": []}
    new_state, events = progress_doctrine("PLAAF", state, year=2026)
    assert new_state["doctrine"] == "conservative"
    assert not any(e["event_type"] == "adversary_doctrine_shifted" for e in events)
