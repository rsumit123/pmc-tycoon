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


def test_ad_engagement_events_include_battery_id_and_hit_bool():
    """Plan 19: every ad_engagement trace event must carry battery_id + hit
    (bool) so the resolver can aggregate per-battery contributions."""
    rng = random.Random(42)
    ao = {"lat": 32.7, "lon": 75.5}
    batteries = [{"id": 7, "base_id": 1, "system_id": "s400", "coverage_km": 150}]
    adv_force = [{"platform_id": "j10c", "count": 6, "faction": "PAF", "role": "CAP"}]
    _, trace = resolve_ad_engagement(
        ao=ao, batteries=batteries, bases_registry=BASES,
        ad_specs=AD_SPEC, adv_force=adv_force, rng=rng,
    )
    engagements = [e for e in trace if e["kind"] == "ad_engagement"]
    assert engagements, "expected at least one ad_engagement event"
    for e in engagements:
        assert e["battery_id"] == 7
        assert isinstance(e["hit"], bool)


def test_ad_contributions_summary_groups_per_battery():
    """resolver.resolve() should write an ad_contributions list summarizing
    per-battery interceptors fired + kills."""
    from app.engine.vignette.resolver import resolve

    ao = {"lat": 32.7, "lon": 75.5}
    bases_registry = {
        1: {"lat": 32.23, "lon": 75.63, "name": "Pathankot"},
        2: {"lat": 31.43, "lon": 75.75, "name": "Adampur"},
    }
    planning_state = {
        "ao": ao,
        "adversary_force": [
            {"role": "strike", "faction": "PAF", "platform_id": "babur_missile",
             "count": 8, "loadout": []},
        ],
        "eligible_squadrons": [],
        "objective": {"kind": "defend_airspace",
                      "success_threshold": {"adv_kills_min": 4, "ind_losses_max": 2}},
        "ad_batteries": [
            {"id": 101, "base_id": 1, "system_id": "s400", "coverage_km": 150},
            {"id": 102, "base_id": 2, "system_id": "s400", "coverage_km": 150},
        ],
        "ad_specs": {"s400": {"coverage_km": 150, "max_pk": 0.45, "name": "S-400"}},
        "bases_registry": bases_registry,
    }
    platforms_registry = {
        "babur_missile": {"combat_radius_km": 9999, "generation": "4",
                          "radar_range_km": 0, "rcs_band": "LO"},
    }
    committed_force = {"squadrons": [], "support": {}, "roe": "weapons_free"}
    outcome, _ = resolve(
        planning_state, committed_force, platforms_registry,
        seed=12345, year=2026, quarter=2,
    )
    contribs = outcome.get("ad_contributions", [])
    assert len(contribs) == 2, f"expected 2 battery entries, got {contribs}"
    ids = {c["battery_id"] for c in contribs}
    assert ids == {101, 102}
    for c in contribs:
        assert c["interceptors_fired"] > 0
        assert c["kills"] >= 0
        assert c["kills"] <= c["interceptors_fired"]


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
