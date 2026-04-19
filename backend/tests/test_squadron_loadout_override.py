import pytest
from app.engine.vignette.planning import compute_eligible_squadrons


def test_squadron_with_loadout_override_uses_it():
    """Squadron with loadout_override_json should use the override."""
    ps = {"ao": {"lat": 30, "lon": 77}}
    sqns = [{
        "id": 1, "name": "Test Sqn", "platform_id": "rafale_f4",
        "base_id": 1, "strength": 18, "readiness_pct": 80, "xp": 0,
        "loadout_override_json": ["astra_mk3", "mica_ir"],
    }]
    bases = {1: {"lat": 30, "lon": 77, "name": "Test Base"}}
    plats = {"rafale_f4": {"combat_radius_km": 1850, "generation": "4.5",
                            "radar_range_km": 200, "rcs_band": "reduced"}}
    out = compute_eligible_squadrons(ps, sqns, bases, plats)
    assert len(out) == 1
    assert "astra_mk3" in out[0]["loadout"]
    assert "mica_ir" in out[0]["loadout"]


def test_squadron_without_override_falls_back_to_platform_loadout():
    """Squadron without override should use static PLATFORM_LOADOUTS."""
    ps = {"ao": {"lat": 30, "lon": 77}}
    sqns = [{
        "id": 1, "name": "Test Sqn", "platform_id": "rafale_f4",
        "base_id": 1, "strength": 18, "readiness_pct": 80, "xp": 0,
    }]
    bases = {1: {"lat": 30, "lon": 77, "name": "Test Base"}}
    plats = {"rafale_f4": {"combat_radius_km": 1850, "generation": "4.5",
                            "radar_range_km": 200, "rcs_band": "reduced"}}
    out = compute_eligible_squadrons(ps, sqns, bases, plats)
    assert len(out) == 1
    # Rafale has meteor in its default BVR/WVR loadout
    assert "meteor" in out[0]["loadout"]


def test_squadron_with_empty_list_override_falls_back():
    """Empty list override should NOT disable weapons — falls back to default."""
    ps = {"ao": {"lat": 30, "lon": 77}}
    sqns = [{
        "id": 1, "name": "Test", "platform_id": "rafale_f4",
        "base_id": 1, "strength": 18, "readiness_pct": 80, "xp": 0,
        "loadout_override_json": [],
    }]
    bases = {1: {"lat": 30, "lon": 77, "name": "Test Base"}}
    plats = {"rafale_f4": {"combat_radius_km": 1850, "generation": "4.5",
                            "radar_range_km": 200, "rcs_band": "reduced"}}
    out = compute_eligible_squadrons(ps, sqns, bases, plats)
    # Empty list is falsy, falls back to PLATFORM_LOADOUTS default
    assert len(out) == 1
    assert "meteor" in out[0]["loadout"]
