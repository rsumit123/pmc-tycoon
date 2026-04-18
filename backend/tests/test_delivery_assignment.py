"""Test best-base picker for acquisition deliveries."""
from app.engine.delivery_assignment import pick_base_for_delivery


BASES = [
    {"id": 1, "template_id": "ambala", "runway_class": "standard", "shelter_count": 18, "lat": 30.37, "lon": 76.78},
    {"id": 2, "template_id": "tezpur", "runway_class": "standard", "shelter_count": 12, "lat": 26.72, "lon": 92.78},
    {"id": 3, "template_id": "thanjavur", "runway_class": "short", "shelter_count": 6, "lat": 10.72, "lon": 79.10},
]

SQUADRONS = [
    {"id": 10, "base_id": 1, "platform_id": "su30_mki", "strength": 18},
    {"id": 11, "base_id": 2, "platform_id": "rafale_f4", "strength": 18},
]

PLATFORM_RAFALE = {"id": "rafale_f4", "runway_class": "standard"}
PLATFORM_TEJAS = {"id": "tejas_mk1a", "runway_class": "short"}


def test_picks_existing_squadron_base_for_consolidation():
    base_id = pick_base_for_delivery(PLATFORM_RAFALE, BASES, SQUADRONS)
    assert base_id == 2  # rafale squadron is at tezpur


def test_falls_back_to_any_matching_runway_if_no_existing():
    plat = {"id": "mirage2000", "runway_class": "standard"}
    base_id = pick_base_for_delivery(plat, BASES, [])
    assert base_id in (1, 2)


def test_rejects_short_runway_mismatch():
    base_id = pick_base_for_delivery(PLATFORM_RAFALE, [BASES[2]], [])
    assert base_id is None


def test_short_runway_platform_accepts_any_base():
    base_id = pick_base_for_delivery(PLATFORM_TEJAS, BASES, [])
    assert base_id is not None
