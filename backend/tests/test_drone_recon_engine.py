import random

from app.engine.drone_recon import (
    bases_covered_by_drones,
    synth_observed_force,
    generate_drone_sightings,
    _upgrade_tier_on_overlap,
)


def test_uncovered_base_returns_empty():
    adv_bases = [{
        "id": 1, "base_id_str": "paf_sargodha",
        "lat": 32.05, "lon": 72.66, "faction": "PAF",
        "tier": "main", "home_platforms": ("f16_blk52",),
    }]
    drones = [{
        "id": 10, "platform_id": "tapas_uav", "base_id": 7,
        "strength": 8, "readiness_pct": 80,
    }]
    friendly = {7: {"lat": 12.95, "lon": 77.66, "name": "Bangalore"}}  # ~1800 km
    assert bases_covered_by_drones(adv_bases, drones, friendly) == []


def test_overlapping_low_drones_upgrade_to_medium():
    assert _upgrade_tier_on_overlap(["low", "low"]) == "medium"
    assert _upgrade_tier_on_overlap(["low"]) == "low"
    assert _upgrade_tier_on_overlap(["medium", "medium"]) == "high"
    assert _upgrade_tier_on_overlap(["high", "low"]) == "high"


def test_covered_base_reports_effective_tier():
    adv_bases = [{
        "id": 1, "base_id_str": "paf_sargodha",
        "lat": 32.05, "lon": 72.66, "faction": "PAF",
        "tier": "main", "home_platforms": ("f16_blk52",),
    }]
    # Pathankot is ~280 km from Sargodha — within MQ-9B 1800 km, within Tapas 300 km.
    drones = [
        {"id": 10, "platform_id": "tapas_uav", "base_id": 5, "strength": 4, "readiness_pct": 80},
        {"id": 11, "platform_id": "mq9b_seaguardian", "base_id": 5, "strength": 2, "readiness_pct": 80},
    ]
    friendly = {5: {"lat": 32.23, "lon": 75.63, "name": "Pathankot"}}
    result = bases_covered_by_drones(adv_bases, drones, friendly)
    assert len(result) == 1
    cov = result[0]
    assert cov["adversary_base_id"] == 1
    assert cov["effective_tier"] == "high"  # MQ-9B wins on tier ranking
    assert len(cov["covering_drones"]) == 2


def test_inactive_drone_ignored():
    adv_bases = [{
        "id": 1, "base_id_str": "paf_sargodha",
        "lat": 32.05, "lon": 72.66, "faction": "PAF",
        "tier": "main", "home_platforms": ("f16_blk52",),
    }]
    drones = [
        {"id": 10, "platform_id": "mq9b_seaguardian", "base_id": 5, "strength": 0, "readiness_pct": 80},
        {"id": 11, "platform_id": "mq9b_seaguardian", "base_id": 5, "strength": 4, "readiness_pct": 0},
    ]
    friendly = {5: {"lat": 32.23, "lon": 75.63, "name": "Pathankot"}}
    assert bases_covered_by_drones(adv_bases, drones, friendly) == []


def test_low_tier_hides_platform_types():
    r = synth_observed_force({"f16_blk52": 20, "jf17_blk3": 20}, ["f16_blk52", "jf17_blk3"],
                              tier="low", rng=random.Random(1))
    assert "count_range" in r
    assert "platforms" not in r
    assert "platforms_detailed" not in r
    lo, hi = r["count_range"]
    assert lo <= hi
    assert 0 <= lo <= 40
    assert hi <= 80  # capped by jitter


def test_medium_tier_shows_count_and_types():
    r = synth_observed_force({"f16_blk52": 20, "jf17_blk3": 20}, ["f16_blk52", "jf17_blk3"],
                              tier="medium", rng=random.Random(1))
    assert "count_range" in r
    assert r["platforms"] == ["f16_blk52", "jf17_blk3"]
    assert "platforms_detailed" not in r
    assert "readiness" not in r


def test_high_tier_full_detail():
    r = synth_observed_force({"f16_blk52": 22, "jf17_blk3": 18}, ["f16_blk52", "jf17_blk3"],
                              tier="high", rng=random.Random(1))
    assert r["total"] == 40
    assert r["platforms_detailed"] == {"f16_blk52": 22, "jf17_blk3": 18}
    assert r["readiness"] in {"low", "medium", "high"}


def test_generate_drone_sightings_end_to_end():
    adv_bases = [
        {"id": 1, "base_id_str": "paf_sargodha", "lat": 32.05, "lon": 72.66,
         "faction": "PAF", "tier": "main",
         "home_platforms": ("f16_blk52", "jf17_blk3")},
        {"id": 2, "base_id_str": "plaaf_hotan", "lat": 37.04, "lon": 79.86,
         "faction": "PLAAF", "tier": "forward",
         "home_platforms": ("j10c", "j11b")},
    ]
    drones = [{
        "id": 10, "platform_id": "heron_tp", "base_id": 5,
        "strength": 6, "readiness_pct": 80,
    }]
    # Pathankot is ~280 km from Sargodha and ~860 km from Hotan — both within Heron's 1000 km.
    friendly = {5: {"lat": 32.23, "lon": 75.63, "name": "Pathankot"}}
    adv_force = {
        "PAF": {"f16_blk52": 22, "jf17_blk3": 80},
        "PLAAF": {"j10c": 120, "j11b": 40},
    }
    cards = generate_drone_sightings(
        adv_bases, drones, friendly, adv_force,
        year=2027, quarter=2, rng=random.Random(1),
    )
    assert len(cards) == 2
    assert all(c["source_type"] == "drone_recon" for c in cards)
    srg = next(c for c in cards if c["payload"]["subject_id"] == "paf_sargodha")
    assert srg["payload"]["subject_kind"] == "adversary_base"
    assert srg["payload"]["observed_force"]["tier"] == "medium"
    assert srg["confidence"] == 0.7
