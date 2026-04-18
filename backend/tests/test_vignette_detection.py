from app.engine.vignette.detection import detection_range_km, detection_advantage


def test_detection_range_conventional_target():
    # R=200, RCS=conventional → 200 km
    assert detection_range_km(200, "conventional", awacs=False) == 200


def test_detection_range_stealth_target():
    # R=200, RCS=VLO → 40 km (VLO detection multiplier = 0.20)
    assert detection_range_km(200, "VLO", awacs=False) == 40


def test_detection_range_awacs_boosts_150_percent():
    # R=200, RCS=VLO, AWACS → 40 * 1.5 = 60 km
    assert detection_range_km(200, "VLO", awacs=True) == 60


def test_detection_advantage_side_with_longer_range_wins():
    # IND r=200 vs VLO adv → 50 km. ADV r=220 vs reduced IND → 154 km.
    # ADV sees further → ADV wins.
    result = detection_advantage(
        ind_radar_km=200, ind_target_rcs="VLO",
        adv_radar_km=220, adv_target_rcs="reduced",
        ind_awacs=False,
    )
    assert result == "adv"


def test_detection_advantage_awacs_flips_it():
    no_awacs = detection_advantage(
        ind_radar_km=220, ind_target_rcs="LO",
        adv_radar_km=200, adv_target_rcs="reduced",
        ind_awacs=False,
    )
    with_awacs = detection_advantage(
        ind_radar_km=220, ind_target_rcs="LO",
        adv_radar_km=200, adv_target_rcs="reduced",
        ind_awacs=True,
    )
    assert no_awacs == "adv"
    assert with_awacs == "ind"


def test_detection_advantage_tied_returns_tie():
    result = detection_advantage(
        ind_radar_km=200, ind_target_rcs="conventional",
        adv_radar_km=200, adv_target_rcs="conventional",
        ind_awacs=False,
    )
    assert result == "tie"
