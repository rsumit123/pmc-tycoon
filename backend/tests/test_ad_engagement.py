import random
from app.engine.vignette.ad_engagement import resolve_ad_engagement


AD_SPEC = {"s400": {"coverage_km": 150, "max_pk": 0.45, "name": "S-400"}}
BASES = {1: {"lat": 32.23, "lon": 75.63, "name": "Pathankot"}}


def test_ad_engages_when_ao_is_in_range():
    rng = random.Random(42)
    ao = {"lat": 32.7, "lon": 75.5}
    batteries = [{"id": 1, "base_id": 1, "system_id": "s400", "coverage_km": 150}]
    adv_force = [{"platform_id": "j10c", "count": 4, "faction": "PAF", "role": "CAP"}]
    survivors, trace = resolve_ad_engagement(
        ao=ao, batteries=batteries, bases_registry=BASES,
        ad_specs=AD_SPEC, adv_force=adv_force, rng=rng,
    )
    total_before = sum(e["count"] for e in adv_force)
    total_after = sum(e["count"] for e in survivors)
    assert total_after <= total_before
    assert any(e["kind"] == "ad_engagement" for e in trace)


def test_ad_does_not_engage_out_of_range():
    rng = random.Random(42)
    ao = {"lat": 10.7, "lon": 79.0}
    batteries = [{"id": 1, "base_id": 1, "system_id": "s400", "coverage_km": 150}]
    adv_force = [{"platform_id": "j10c", "count": 4, "faction": "PAF", "role": "CAP"}]
    survivors, trace = resolve_ad_engagement(
        ao=ao, batteries=batteries, bases_registry=BASES,
        ad_specs=AD_SPEC, adv_force=adv_force, rng=rng,
    )
    assert sum(e["count"] for e in adv_force) == sum(e["count"] for e in survivors)
    assert trace == []


def test_no_batteries_is_noop():
    rng = random.Random(42)
    ao = {"lat": 32.7, "lon": 75.5}
    adv_force = [{"platform_id": "j10c", "count": 4, "faction": "PAF", "role": "CAP"}]
    survivors, trace = resolve_ad_engagement(
        ao=ao, batteries=[], bases_registry=BASES, ad_specs=AD_SPEC,
        adv_force=adv_force, rng=rng,
    )
    assert survivors == adv_force
    assert trace == []


def test_deterministic_with_same_rng():
    batteries = [{"id": 1, "base_id": 1, "system_id": "s400", "coverage_km": 150}]
    adv = [{"platform_id": "j10c", "count": 4, "faction": "PAF", "role": "CAP"}]
    rng1 = random.Random(7)
    rng2 = random.Random(7)
    s1, t1 = resolve_ad_engagement(
        ao={"lat": 32.7, "lon": 75.5}, batteries=batteries, bases_registry=BASES,
        ad_specs=AD_SPEC, adv_force=adv, rng=rng1,
    )
    s2, t2 = resolve_ad_engagement(
        ao={"lat": 32.7, "lon": 75.5}, batteries=batteries, bases_registry=BASES,
        ad_specs=AD_SPEC, adv_force=adv, rng=rng2,
    )
    assert s1 == s2
    assert t1 == t2
