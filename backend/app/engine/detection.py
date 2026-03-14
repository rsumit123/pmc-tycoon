"""Detection phase calculations using the radar range equation."""

from app.engine.types import AircraftData, DetectionResult, ShipData


# Reference RCS for normalization (5m² is a "typical" fighter)
REFERENCE_RCS = 5.0


def calculate_air_detection(
    player: AircraftData,
    enemy: AircraftData,
    player_choice: str,
) -> DetectionResult:
    """
    Calculate detection advantage in air combat.

    Detection range = radar_range * (target_rcs / reference_rcs)^0.25
    This is derived from the radar range equation where detection range
    scales with the fourth root of RCS.
    """
    # Base detection ranges
    player_detect_range = player.radar_range_km * (enemy.rcs_m2 / REFERENCE_RCS) ** 0.25
    enemy_detect_range = enemy.radar_range_km * (player.rcs_m2 / REFERENCE_RCS) ** 0.25

    # Player choice modifiers
    if player_choice == "aggressive_scan":
        # Full power radar — max detection but enemy may detect your emissions
        player_detect_range *= 1.1
        enemy_detect_range *= 1.05  # enemy gets slight boost from detecting your radar
    elif player_choice == "passive_irst":
        # IRST only — shorter range but completely passive
        if player.irst:
            player_detect_range *= 0.5  # IRST range is much shorter
            enemy_detect_range *= 0.85  # enemy can't detect passive IRST
        else:
            player_detect_range *= 0.3  # no IRST, relying on passive RWR
            enemy_detect_range *= 0.85
    elif player_choice == "early_ecm":
        # Activate ECM early — degrades both sides' radar
        player_detect_range *= 0.9  # own detection slightly degraded
        ecm_effect = player.ecm_rating / 200.0  # 0-0.5 reduction
        enemy_detect_range *= (1.0 - ecm_effect)

    advantage = player_detect_range - enemy_detect_range
    first_detect = "player" if advantage > 0 else "enemy"

    return DetectionResult(
        player_detection_range_km=round(player_detect_range, 1),
        enemy_detection_range_km=round(enemy_detect_range, 1),
        advantage_km=round(abs(advantage), 1),
        first_detect=first_detect,
        narrative="",  # filled by narrative.py
    )


def calculate_naval_detection(
    player: ShipData,
    enemy: ShipData,
    player_choice: str,
) -> DetectionResult:
    """Calculate detection in naval combat. Ships are large so RCS matters less;
    radar power and horizon distance dominate."""
    # Naval radar is more about horizon and power
    player_detect_range = player.radar_range_km * 0.9  # slightly less than max due to sea clutter
    enemy_detect_range = enemy.radar_range_km * 0.9

    if player_choice == "helicopter_recon":
        player_detect_range *= 1.3  # helicopter extends detection beyond horizon
    elif player_choice == "passive_sonar":
        player_detect_range *= 0.6  # shorter but stealthy
        enemy_detect_range *= 0.8
    elif player_choice == "full_radar_sweep":
        player_detect_range *= 1.1
        enemy_detect_range *= 1.05

    advantage = player_detect_range - enemy_detect_range
    first_detect = "player" if advantage > 0 else "enemy"

    return DetectionResult(
        player_detection_range_km=round(player_detect_range, 1),
        enemy_detection_range_km=round(enemy_detect_range, 1),
        advantage_km=round(abs(advantage), 1),
        first_detect=first_detect,
        narrative="",
    )
