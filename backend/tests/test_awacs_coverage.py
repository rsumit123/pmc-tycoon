"""AWACS coverage of a vignette AO."""
from app.engine.vignette.awacs_coverage import awacs_covering


BASES = {
    1: {"id": 1, "name": "Agra", "lat": 27.16, "lon": 77.96},
    2: {"id": 2, "name": "Panagarh", "lat": 23.46, "lon": 87.42},
    3: {"id": 3, "name": "Thanjavur", "lat": 10.72, "lon": 79.10},
}


def test_netra_at_agra_covers_ladakh():
    squadrons = [{"id": 100, "platform_id": "netra_aewc", "base_id": 1, "strength": 3, "readiness_pct": 80}]
    ao = {"lat": 34.0, "lon": 78.5, "name": "Ladakh"}  # ~800km from Agra
    covering = awacs_covering(ao, squadrons, BASES, awacs_orbit_radius_km=1000)
    assert len(covering) == 1
    assert covering[0]["squadron_id"] == 100


def test_netra_at_thanjavur_does_not_cover_ladakh():
    squadrons = [{"id": 101, "platform_id": "netra_aewc", "base_id": 3, "strength": 3, "readiness_pct": 80}]
    ao = {"lat": 34.0, "lon": 78.5, "name": "Ladakh"}  # >2500km from Thanjavur
    covering = awacs_covering(ao, squadrons, BASES, awacs_orbit_radius_km=1000)
    assert covering == []


def test_no_awacs_squadrons_returns_empty():
    squadrons = [{"id": 102, "platform_id": "su30_mki", "base_id": 1, "strength": 18, "readiness_pct": 80}]
    ao = {"lat": 34.0, "lon": 78.5, "name": "Ladakh"}
    covering = awacs_covering(ao, squadrons, BASES, awacs_orbit_radius_km=1000)
    assert covering == []


def test_zero_readiness_awacs_excluded():
    squadrons = [{"id": 103, "platform_id": "netra_aewc", "base_id": 1, "strength": 3, "readiness_pct": 0}]
    ao = {"lat": 34.0, "lon": 78.5, "name": "Ladakh"}
    covering = awacs_covering(ao, squadrons, BASES, awacs_orbit_radius_km=1000)
    assert covering == []
