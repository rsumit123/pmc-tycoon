"""Content sanity tests for adversary_bases.yaml + strike metadata."""
from app.content.registry import adversary_bases as _load


def test_adversary_base_catalog_has_paf_plaaf_plan():
    bases = _load()
    factions = {b.faction for b in bases.values()}
    assert {"PAF", "PLAAF", "PLAN"} == factions


def test_every_base_has_coords_and_tier():
    for b in _load().values():
        assert -90 <= b.lat <= 90
        assert -180 <= b.lon <= 180
        assert b.tier in {"main", "forward", "support"}
        assert b.name
        assert b.home_platforms  # non-empty list


def test_adversary_bases_have_strike_metadata():
    bases = _load()
    for spec in bases.values():
        assert spec.shelter_count > 0, f"{spec.id} shelter_count missing"
        assert isinstance(spec.garrisoned_platforms, list)
        assert 1 <= spec.value <= 5, f"{spec.id} value out of range"
        assert isinstance(spec.command_node, bool)
    cnode_factions = {s.faction for s in bases.values() if s.command_node}
    assert {"PAF", "PLAAF", "PLAN"} <= cnode_factions
