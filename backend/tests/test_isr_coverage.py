"""ISR drone coverage computation — mirrors awacs_covering for tapas_uav / ghatak_ucav."""
from app.engine.vignette.awacs_coverage import isr_drone_covering

BASES = {1: {"id": 1, "name": "Agra", "lat": 27.16, "lon": 77.96}}


def test_tapas_at_agra_covers_nearby_ao():
    sqns = [{"id": 100, "platform_id": "tapas_uav", "base_id": 1, "strength": 2, "readiness_pct": 80}]
    ao = {"lat": 30.0, "lon": 76.0}  # ~350km from Agra, within 700km orbit
    covering = isr_drone_covering(ao, sqns, BASES)
    assert len(covering) == 1


def test_fighter_is_not_isr():
    sqns = [{"id": 101, "platform_id": "su30_mki", "base_id": 1, "strength": 18, "readiness_pct": 80}]
    ao = {"lat": 30.0, "lon": 76.0}
    covering = isr_drone_covering(ao, sqns, BASES)
    assert covering == []


def test_far_ao_not_covered():
    sqns = [{"id": 102, "platform_id": "tapas_uav", "base_id": 1, "strength": 2, "readiness_pct": 80}]
    ao = {"lat": 10.0, "lon": 79.0}  # Thanjavur, ~2000km
    covering = isr_drone_covering(ao, sqns, BASES)
    assert covering == []
