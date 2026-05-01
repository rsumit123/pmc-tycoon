from app.content.registry import strike_profiles


def test_strike_profiles_load():
    profiles = strike_profiles()
    assert {"deep_strike", "sead_suppression", "standoff_cruise", "drone_swarm"} <= set(profiles)


def test_sead_suppresses_ad():
    p = strike_profiles()["sead_suppression"]
    assert p.suppresses_ad is True
    assert p.suppression_pct > 0


def test_standoff_cruise_zero_egress_risk():
    p = strike_profiles()["standoff_cruise"]
    assert p.egress_risk == 0.0
    assert p.detection_modifier == 0.0


def test_deep_strike_requires_two_squadrons():
    p = strike_profiles()["deep_strike"]
    assert p.requires_min_squadrons == 2
