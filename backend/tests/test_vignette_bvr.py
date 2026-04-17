from app.engine.vignette.bvr import (
    WEAPONS, PLATFORM_LOADOUTS, GENERATION_SCORES, RCS_DETECTION_MULTIPLIER,
    engagement_pk,
)


def test_weapons_table_has_locked_keys():
    # Confirm the plan's key weapons are registered
    for w in ("meteor", "pl15", "pl17", "astra_mk2", "r73", "pl10"):
        assert w in WEAPONS
        assert "nez_km" in WEAPONS[w]
        assert "max_range_km" in WEAPONS[w]
        assert WEAPONS[w]["nez_km"] <= WEAPONS[w]["max_range_km"]


def test_platform_loadouts_cover_key_platforms():
    for p in ("rafale_f4", "su30_mki", "tejas_mk1a", "amca_mk1",
              "j20a", "j35e", "j10ce"):
        assert p in PLATFORM_LOADOUTS
        assert PLATFORM_LOADOUTS[p]["bvr"]
        assert PLATFORM_LOADOUTS[p]["wvr"]


def test_generation_scores_match_spec():
    assert GENERATION_SCORES["4.5"] == 0.6
    assert GENERATION_SCORES["5"] == 0.9


def test_rcs_multiplier_is_monotonic():
    # VLO < LO < reduced < conventional < large
    m = RCS_DETECTION_MULTIPLIER
    assert m["VLO"] < m["LO"] < m["reduced"] < m["conventional"] < m["large"]


def test_pk_zero_outside_max_range():
    pk = engagement_pk("meteor", distance_km=500, attacker_gen="4.5",
                       defender_rcs="reduced", ew_modifier=0.0)
    assert pk == 0.0


def test_pk_higher_inside_nez_than_outside():
    inside = engagement_pk("meteor", distance_km=50, attacker_gen="4.5",
                           defender_rcs="reduced", ew_modifier=0.0)
    outside = engagement_pk("meteor", distance_km=150, attacker_gen="4.5",
                            defender_rcs="reduced", ew_modifier=0.0)
    assert inside > outside > 0


def test_pk_capped_at_70():
    pk = engagement_pk("meteor", distance_km=10, attacker_gen="6",
                       defender_rcs="large", ew_modifier=0.0)
    assert pk <= 0.70


def test_pk_never_negative():
    pk = engagement_pk("meteor", distance_km=150, attacker_gen="3",
                       defender_rcs="VLO", ew_modifier=0.30)
    assert pk >= 0.0


def test_pk_lowered_by_ew():
    no_ew = engagement_pk("meteor", distance_km=60, attacker_gen="4.5",
                          defender_rcs="reduced", ew_modifier=0.0)
    with_ew = engagement_pk("meteor", distance_km=60, attacker_gen="4.5",
                            defender_rcs="reduced", ew_modifier=0.10)
    assert with_ew < no_ew


def test_pk_lowered_by_stealth_defender():
    vs_conv = engagement_pk("pl15", distance_km=80, attacker_gen="5",
                            defender_rcs="conventional", ew_modifier=0.0)
    vs_vlo = engagement_pk("pl15", distance_km=80, attacker_gen="5",
                           defender_rcs="VLO", ew_modifier=0.0)
    assert vs_vlo < vs_conv


def test_pk_generation_advantage():
    gen_low = engagement_pk("meteor", distance_km=60, attacker_gen="4",
                            defender_rcs="reduced", ew_modifier=0.0)
    gen_high = engagement_pk("meteor", distance_km=60, attacker_gen="5",
                             defender_rcs="reduced", ew_modifier=0.0)
    assert gen_high > gen_low
