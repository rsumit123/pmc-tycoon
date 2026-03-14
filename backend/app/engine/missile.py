"""Missile kill probability calculations."""

import random
from app.engine.types import WeaponData, AircraftData, MissilePkResult


def clamp(value: float, min_val: float, max_val: float) -> float:
    return max(min_val, min(max_val, value))


def calculate_missile_pk(
    weapon: WeaponData,
    launch_range_km: float,
    target_ecm_rating: int,
    target_max_g: float,
    target_twr_ratio: float,  # current_twr / clean_twr (< 1 when loaded)
    player_modifier: float,  # from choice effectiveness
    rng: random.Random | None = None,
) -> MissilePkResult:
    """
    Calculate kill probability for a missile shot.

    Pk = base_pk * range_factor * ecm_factor * maneuver_factor * payload_factor * player_modifier

    Returns MissilePkResult with per-factor breakdown and hit/miss result.
    """
    if rng is None:
        rng = random.Random()

    # --- Range factor ---
    # 1.0 at no-escape range, degrades exponentially toward max range
    # Below Rne, Pk actually increases slightly
    rne = weapon.no_escape_range_km
    rmax = weapon.max_range_km

    if launch_range_km <= rne:
        range_factor = 1.0 + (rne - launch_range_km) / rne * 0.1  # up to +10% inside Rne
    elif launch_range_km <= rmax:
        range_factor = 1.0 - ((launch_range_km - rne) / (rmax - rne)) ** 1.5
    else:
        range_factor = 0.05  # almost zero beyond max range

    range_factor = clamp(range_factor, 0.05, 1.1)

    # --- ECM factor ---
    # Target's ECM vs missile's ECCM. If ECM > ECCM, missile is degraded.
    ecm_delta = target_ecm_rating - weapon.eccm_rating
    ecm_factor = clamp(1.0 - ecm_delta / 150.0, 0.3, 1.0)

    # --- Maneuver factor ---
    # Can the target out-maneuver the missile in terminal phase?
    # missile_g / (target_g * 2.5) — missile needs ~2.5x target G to reliably track
    if target_max_g > 0:
        maneuver_factor = clamp(weapon.maneuverability_g / (target_max_g * 2.5), 0.4, 1.0)
    else:
        maneuver_factor = 1.0

    # --- Payload factor ---
    # Heavier-loaded aircraft are slower to evade. twr_ratio < 1 = loaded = easier to hit
    payload_factor = clamp(1.1 - target_twr_ratio * 0.15, 0.9, 1.15)

    # --- Player modifier ---
    # Already computed by choices.py, typically 0.6 - 1.4
    player_modifier = clamp(player_modifier, 0.3, 1.5)

    # --- Final Pk ---
    final_pk = weapon.base_pk * range_factor * ecm_factor * maneuver_factor * payload_factor * player_modifier
    final_pk = clamp(final_pk, 0.02, 0.95)

    # --- Roll ---
    roll = rng.randint(1, 100)
    hit = roll <= int(final_pk * 100)

    return MissilePkResult(
        weapon_name=weapon.name,
        final_pk=round(final_pk, 3),
        range_factor=round(range_factor, 3),
        ecm_factor=round(ecm_factor, 3),
        maneuver_factor=round(maneuver_factor, 3),
        payload_factor=round(payload_factor, 3),
        player_modifier=round(player_modifier, 3),
        hit=hit,
        roll=roll,
        narrative="",  # filled by narrative.py
    )
