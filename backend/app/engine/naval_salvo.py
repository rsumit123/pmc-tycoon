"""Naval salvo model — layered defense calculations."""

import random
from typing import List, Dict, Any
from app.engine.types import WeaponData, ShipData, SalvoResult


def calculate_salvo_result(
    missiles_launched: int,
    missile_weapon: WeaponData,
    enemy_ship: ShipData,
    attack_profile: str,  # "sea_skim", "high_dive", "mixed"
    player_modifier: float,
    rng: random.Random | None = None,
) -> SalvoResult:
    """
    Calculate the result of a missile salvo against a ship's layered defenses.

    Defense layers engage in order: SAM (long range) → point defense → CIWS (close in)
    Each layer has a chance to intercept missiles. Leakers = missiles that get through.
    """
    if rng is None:
        rng = random.Random()

    leakers = float(missiles_launched)
    layer_breakdown = []

    # Attack profile modifiers
    # Sea-skimming: harder for SAM to engage (radar horizon), easier for CIWS
    # High-dive: easier for SAM, harder for CIWS (high speed terminal)
    profile_vs_sam = {"sea_skim": 0.7, "high_dive": 1.1, "mixed": 0.9}
    profile_vs_ciws = {"sea_skim": 1.1, "high_dive": 0.7, "mixed": 0.9}

    # --- Layer 1: SAM systems ---
    for sam_system in enemy_ship.sam_systems:
        if leakers <= 0:
            break
        sam_weapon: WeaponData = sam_system["weapon"]
        sam_count = sam_system["count"]

        # SAM Pk degraded by missile speed and ECM
        speed_factor = max(0.5, 1.0 - (missile_weapon.speed_mach - 1.0) / 5.0)
        ecm_factor = max(0.4, 1.0 - (missile_weapon.eccm_rating - sam_weapon.eccm_rating) / 200.0)
        profile_mod = profile_vs_sam.get(attack_profile, 0.9)

        effective_pk = sam_weapon.base_pk * speed_factor * ecm_factor * profile_mod * player_modifier
        effective_pk = max(0.1, min(0.9, effective_pk))

        # Each SAM can engage one missile
        salvos_available = min(sam_count, int(leakers) + 1)
        intercepted = 0
        for _ in range(salvos_available):
            if leakers <= 0:
                break
            if rng.random() < effective_pk:
                intercepted += 1
                leakers -= 1

        layer_breakdown.append({
            "layer": f"SAM ({sam_weapon.name})",
            "available": sam_count,
            "engaged": salvos_available,
            "intercepted": intercepted,
            "effective_pk": round(effective_pk, 2),
            "remaining": max(0, round(leakers)),
        })

    # --- Layer 2: CIWS ---
    for ciws_system in enemy_ship.ciws:
        if leakers <= 0:
            break
        ciws_weapon: WeaponData = ciws_system["weapon"]
        ciws_count = ciws_system["count"]

        profile_mod = profile_vs_ciws.get(attack_profile, 0.9)
        effective_pk = ciws_weapon.base_pk * profile_mod
        effective_pk = max(0.1, min(0.7, effective_pk))

        intercepted = 0
        for _ in range(ciws_count):
            if leakers <= 0:
                break
            if rng.random() < effective_pk:
                intercepted += 1
                leakers -= 1

        layer_breakdown.append({
            "layer": f"CIWS ({ciws_weapon.name})",
            "available": ciws_count,
            "engaged": ciws_count,
            "intercepted": intercepted,
            "effective_pk": round(effective_pk, 2),
            "remaining": max(0, round(leakers)),
        })

    # --- Damage calculation ---
    hits = max(0, int(leakers))
    if hits > 0 and enemy_ship.displacement_tons > 0:
        damage_per_hit = missile_weapon.warhead_kg / (enemy_ship.displacement_tons * 0.015)
        total_damage = min(100.0, hits * damage_per_hit * 100)
    else:
        total_damage = 0.0

    return SalvoResult(
        missiles_launched=missiles_launched,
        leakers=hits,
        hits=hits,
        damage_percent=round(total_damage, 1),
        layer_breakdown=layer_breakdown,
        narrative="",
    )
