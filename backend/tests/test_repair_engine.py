from app.engine.repair import tick_base_damage


def test_runway_decay_one_quarter():
    state = {"shelter_loss_pct": 30, "runway_disabled_quarters_remaining": 2,
             "ad_destroyed": False, "garrisoned_loss": 4}
    out = tick_base_damage(state)
    assert out["runway_disabled_quarters_remaining"] == 1


def test_shelter_regen_per_quarter():
    state = {"shelter_loss_pct": 40, "runway_disabled_quarters_remaining": 0,
             "ad_destroyed": False, "garrisoned_loss": 8}
    out = tick_base_damage(state)
    assert out["shelter_loss_pct"] == 30
    assert out["garrisoned_loss"] == 6


def test_zero_state_idempotent():
    state = {"shelter_loss_pct": 0, "runway_disabled_quarters_remaining": 0,
             "ad_destroyed": False, "garrisoned_loss": 0}
    assert tick_base_damage(state) == state


def test_ad_destroyed_clears_after_8_quarters_via_quarters_since_field():
    state = {"shelter_loss_pct": 0, "runway_disabled_quarters_remaining": 0,
             "ad_destroyed": True, "ad_destroyed_quarters_since": 7,
             "garrisoned_loss": 0}
    out = tick_base_damage(state)
    assert out["ad_destroyed_quarters_since"] == 8
    assert out["ad_destroyed"] is True
    out2 = tick_base_damage(out)
    assert out2["ad_destroyed"] is False
    assert out2["ad_destroyed_quarters_since"] == 0
