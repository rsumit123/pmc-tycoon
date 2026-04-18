"""BVR platform loadout tests."""

from app.engine.vignette.bvr import PLATFORM_LOADOUTS, WEAPONS


def test_h6kj_has_cruise_missile_loadout():
    """H-6KJ bomber should have non-empty BVR (cruise missile) loadout."""
    loadout = PLATFORM_LOADOUTS["h6kj"]
    assert loadout["bvr"] != [], "h6kj should have BVR weapons"
    for weapon in loadout["bvr"]:
        assert weapon in WEAPONS, f"Weapon {weapon} not found in WEAPONS dict"


def test_h6n_has_cruise_missile_loadout():
    """H-6N bomber should have non-empty BVR (cruise missile) loadout."""
    loadout = PLATFORM_LOADOUTS["h6n"]
    assert loadout["bvr"] != [], "h6n should have BVR weapons"
    for weapon in loadout["bvr"]:
        assert weapon in WEAPONS, f"Weapon {weapon} not found in WEAPONS dict"


def test_bombers_have_no_wvr():
    """Both H-6KJ and H-6N should have empty WVR lists (no dogfighting)."""
    assert PLATFORM_LOADOUTS["h6kj"]["wvr"] == [], "h6kj should have no WVR weapons"
    assert PLATFORM_LOADOUTS["h6n"]["wvr"] == [], "h6n should have no WVR weapons"
