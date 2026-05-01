from app.engine.diplomacy import (
    tier_from_temperature, tick_diplomacy_temp,
    grant_multiplier_pct, is_supplier_blocked,
)


def test_tier_bands():
    assert tier_from_temperature(75) == "friendly"
    assert tier_from_temperature(50) == "neutral"
    assert tier_from_temperature(35) == "cool"
    assert tier_from_temperature(15) == "cold"
    assert tier_from_temperature(5) == "hostile"


def test_drift_pulls_to_neutral():
    assert tick_diplomacy_temp(30, strikes_this_quarter=0) == 32
    assert tick_diplomacy_temp(75, strikes_this_quarter=0) == 73
    assert tick_diplomacy_temp(50, strikes_this_quarter=0) == 50


def test_strikes_drop_temperature():
    # 60 -> -8 = 52 -> drift down to 50 (since 52 > 50, drift is -2 → exactly 50)
    assert tick_diplomacy_temp(60, strikes_this_quarter=1) == 50
    # 3 strikes from 60: 60 - 24 = 36, then drift +2 → 38.
    assert tick_diplomacy_temp(60, strikes_this_quarter=3) == 38


def test_temperature_clamped_0_100():
    assert tick_diplomacy_temp(5, strikes_this_quarter=10) == 0
    assert tick_diplomacy_temp(99, strikes_this_quarter=0) == 97


def test_grant_multiplier_caps_at_150():
    pcts = {"PAF": "hostile", "PLAAF": "hostile", "PLAN": "hostile"}
    assert grant_multiplier_pct(pcts) == 150


def test_grant_multiplier_sums():
    pcts = {"PAF": "cold", "PLAAF": "cool", "PLAN": "neutral"}
    assert grant_multiplier_pct(pcts) == 40


def test_supplier_blocked_when_hostile():
    assert is_supplier_blocked("CHN", {"PLAAF": "hostile"}) is True
    assert is_supplier_blocked("PAK", {"PAF": "cold"}) is False
    assert is_supplier_blocked("FR", {"PAF": "hostile"}) is False
    assert is_supplier_blocked("IND", {"PAF": "hostile"}) is False
