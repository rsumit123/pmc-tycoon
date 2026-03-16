"""Template-based narrative generation for battle phases."""

import random
from typing import Dict, Any, TYPE_CHECKING
from app.engine.types import DetectionResult, MissilePkResult, SalvoResult

if TYPE_CHECKING:
    from app.engine.types import TurnResult


def detection_narrative(
    player_name: str,
    enemy_name: str,
    result: DetectionResult,
    player_choice: str,
) -> str:
    """Generate narrative for the detection phase."""
    if result.first_detect == "player":
        templates = [
            f"Your {player_name}'s radar paints the {enemy_name} at {result.player_detection_range_km}km. "
            f"The enemy won't see you for another {result.advantage_km}km — a decisive first-look advantage.",

            f"Contact. The {enemy_name} lights up your scope at {result.player_detection_range_km}km. "
            f"Their radar is still searching empty sky — you have {result.advantage_km}km of free maneuver.",

            f"Your sensors pick up the {enemy_name} at {result.player_detection_range_km}km while they remain blind. "
            f"At their detection range of {result.enemy_detection_range_km}km, you hold a {result.advantage_km}km edge.",
        ]
    else:
        templates = [
            f"Warning — the {enemy_name} has detected you first at {result.enemy_detection_range_km}km. "
            f"Your radar only reaches them at {result.player_detection_range_km}km. You're {result.advantage_km}km behind.",

            f"RWR alarm. The {enemy_name}'s radar has you locked before you even see them. "
            f"They hold a {result.advantage_km}km detection advantage.",

            f"The {enemy_name} spots you at {result.enemy_detection_range_km}km. "
            f"Your {player_name} won't see them until {result.player_detection_range_km}km — you're reacting, not initiating.",
        ]

    choice_suffix = {
        "aggressive_scan": " Your aggressive radar sweep maximized detection range.",
        "passive_irst": " You're running silent on IRST — the enemy can't detect your emissions.",
        "early_ecm": " Your ECM is degrading their radar picture.",
        "helicopter_recon": " Your helicopter extends detection beyond the radar horizon.",
        "passive_sonar": " Passive sonar keeps your emissions silent.",
        "full_radar_sweep": " Full radar power sweeps the sector.",
    }

    text = random.choice(templates)
    text += choice_suffix.get(player_choice, "")
    return text


def missile_narrative(
    weapon_name: str,
    target_name: str,
    result: MissilePkResult,
    launch_range: float,
) -> str:
    """Generate narrative for a missile engagement."""
    if result.hit:
        templates = [
            f"{weapon_name} tracks true. At {launch_range:.0f}km, the missile's seeker locks on and "
            f"guides to impact. The {target_name} takes a direct hit.",

            f"The {weapon_name} streaks toward the {target_name}. Despite evasive maneuvers, "
            f"the missile's {result.maneuver_factor:.0%} tracking capability proves sufficient. Hit confirmed.",

            f"Kill. The {weapon_name} detonates within lethal radius of the {target_name}. "
            f"At Pk {result.final_pk:.0%}, the odds were in your favor — and the dice agreed.",
        ]
    else:
        reasons = []
        if result.range_factor < 0.6:
            reasons.append(f"the missile burned too much energy covering {launch_range:.0f}km")
        if result.ecm_factor < 0.7:
            reasons.append("enemy ECM degraded the seeker")
        if result.maneuver_factor < 0.7:
            reasons.append("the target's agility outmatched the missile's tracking")
        if not reasons:
            reasons.append("the target's defensive maneuver was just enough")

        reason_text = " and ".join(reasons)
        templates = [
            f"The {weapon_name} loses track — {reason_text}. "
            f"Pk was {result.final_pk:.0%}, roll {result.roll} vs {int(result.final_pk * 100)} needed. Miss.",

            f"Near miss. The {weapon_name} detonates but outside lethal radius. "
            f"{reason_text.capitalize()}. The {target_name} survives.",

            f"The {target_name} evades your {weapon_name}. {reason_text.capitalize()}. "
            f"At {result.final_pk:.0%} Pk, it was always a coin toss.",
        ]

    return random.choice(templates)


def salvo_narrative(
    missile_name: str,
    target_name: str,
    result: SalvoResult,
) -> str:
    """Generate narrative for a naval salvo."""
    if result.hits == 0:
        return (
            f"All {result.missiles_launched} {missile_name} missiles are intercepted. "
            f"The {target_name}'s layered defense holds — "
            f"{', '.join(f'{l['layer']} stops {l['intercepted']}' for l in result.layer_breakdown if l['intercepted'] > 0)}. "
            f"No damage inflicted."
        )

    if result.hits == result.missiles_launched:
        return (
            f"Complete salvo penetration. All {result.missiles_launched} {missile_name} missiles "
            f"punch through the {target_name}'s defenses. Catastrophic damage — {result.damage_percent:.0f}% of hull compromised."
        )

    return (
        f"Of {result.missiles_launched} {missile_name} missiles launched, "
        f"{result.leakers} penetrate the {target_name}'s defenses. "
        f"{''.join(f'{l['layer']} intercepts {l['intercepted']}. ' for l in result.layer_breakdown if l['intercepted'] > 0)}"
        f"{result.hits} hit{'s' if result.hits > 1 else ''} — {result.damage_percent:.0f}% damage inflicted."
    )


def wvr_narrative(
    player_name: str,
    enemy_name: str,
    choice: str,
    hit: bool,
    weapon_name: str = "",
) -> str:
    """Generate narrative for WVR / close-in combat."""
    if choice == "ir_missile":
        if hit:
            return f"At close range, your {weapon_name} locks onto the {enemy_name}'s heat signature and guides to impact. The kill is clean."
        return f"Your {weapon_name} tracks the {enemy_name} but the target deploys flares at the last moment, breaking the IR lock."
    elif choice == "guns_engage":
        if hit:
            return f"You close to gun range and your cannon tears into the {enemy_name}. Rounds find their mark — devastating damage."
        return f"You pull lead on the {enemy_name} but the target's evasive flying keeps you out of solution. Your rounds go wide."
    elif choice == "disengage":
        return f"You break off the engagement, extending away from the {enemy_name}. Discretion is the better part of valor."
    return ""


def damage_phase_narrative(
    player_name: str,
    choice: str,
    player_damage: float,
    enemy_damage: float,
) -> str:
    """Generate narrative for the damage/disengage phase."""
    if choice == "press_attack":
        if player_damage < 30:
            return f"Your {player_name} is still combat-effective. You push the advantage, pressing the attack."
        return f"Despite {player_damage:.0f}% damage, you press on. Your {player_name} strains under the punishment."
    elif choice == "rtb":
        return f"With {player_damage:.0f}% damage sustained, you make the call to RTB. The {player_name} turns for home."
    elif choice == "call_reinforcements":
        return f"You radio for support while maintaining contact. Reinforcements will shift the balance."
    return ""


# ═══ Tactical Battle System (v2) Narratives ═══

_ACTION_LABELS = {
    "scan": "scans the target",
    "ecm": "deploys ECM jamming",
    "flares": "pops flares",
    "close": "closes range",
    "extend": "extends away",
    "break_turn": "breaks hard",
    "go_passive": "goes dark",
    "disengage": "disengages",
    "guns": "engages with guns",
    "fire_bvr": "fires a BVR missile",
    "fire_ir": "fires an IR missile",
}


def _action_label(action: str) -> str:
    """Get readable label for a player/enemy action."""
    for prefix, label in _ACTION_LABELS.items():
        if action.startswith(prefix):
            return label
    return action.replace("_", " ")


def turn_narrative(
    player_name: str,
    enemy_name: str,
    player_action: str,
    enemy_action: str,
    result: "TurnResult",
) -> str:
    """Generate narrative for a tactical turn."""
    parts = []

    player_verb = _action_label(player_action)
    enemy_verb = _action_label(enemy_action)

    # Opening — what both sides did
    templates_both_fire = [
        f"Both pilots commit — you fire while the {enemy_name} launches back.",
        f"Simultaneous engagement! You and the {enemy_name} trade shots.",
    ]
    templates_fire_vs_maneuver = [
        f"You {player_verb} as the {enemy_name} {enemy_verb}.",
        f"Your {player_name} {player_verb}. The {enemy_name} responds by {enemy_verb.rstrip('s')}ing.",
    ]
    templates_maneuver_vs_fire = [
        f"You {player_verb} as the {enemy_name} {enemy_verb}.",
        f"The {enemy_name} {enemy_verb} while you {player_verb}.",
    ]
    templates_both_maneuver = [
        f"You {player_verb} while the {enemy_name} {enemy_verb}.",
        f"Both aircraft maneuver — you {player_verb}, the {enemy_name} {enemy_verb}.",
    ]

    player_fires = player_action.startswith("fire_") or player_action == "guns"
    enemy_fires = enemy_action.startswith("fire_") or enemy_action == "guns"

    if player_fires and enemy_fires:
        parts.append(random.choice(templates_both_fire))
    elif player_fires:
        parts.append(random.choice(templates_fire_vs_maneuver))
    elif enemy_fires:
        parts.append(random.choice(templates_maneuver_vs_fire))
    else:
        parts.append(random.choice(templates_both_maneuver))

    # Player shot result
    if result.shot_hit is not None:
        weapon_name = result.weapon_fired or "weapon"
        if result.shot_hit:
            parts.append(f"Your {weapon_name} hits! {result.damage_dealt:.0f}% damage dealt.")
        else:
            parts.append(f"Your {weapon_name} misses — Pk was {result.shot_pk:.0%}.")

    # Enemy shot result
    if result.enemy_shot_hit is not None:
        enemy_weapon = result.enemy_weapon_fired or "weapon"
        if result.enemy_shot_hit:
            parts.append(f"The {enemy_name}'s {enemy_weapon} strikes home — {result.damage_taken:.0f}% damage taken!")
        else:
            parts.append(f"The {enemy_name}'s {enemy_weapon} misses.")

    # Intel reveal
    if result.intel_revealed:
        parts.append(f"Scan reveals enemy {result.intel_revealed}.")

    # Scan action (when no intel revealed)
    if player_action == "scan" and not result.intel_revealed:
        parts.append("Scan complete — no new data.")

    # Range change
    if abs(result.range_change) > 5:
        if result.range_change < 0:
            parts.append(f"Range closes to {result.new_range:.0f}km.")
        else:
            parts.append(f"Range opens to {result.new_range:.0f}km.")

    # Zone transition
    old_zone = result.zone  # This is the zone after the turn
    # We note it if interesting
    if result.new_range <= 15 and result.new_range + abs(result.range_change) > 15:
        parts.append("Entering WVR — weapons free!")
    elif result.new_range <= 40 and result.new_range + abs(result.range_change) > 40:
        parts.append("Entering transition zone.")

    return " ".join(parts)


# ═══ Naval Tactical Battle System (v2) Narratives ═══

_NAVAL_ACTION_LABELS = {
    "scan": "scans the target",
    "full_radar": "activates full radar sweep",
    "passive_approach": "closes on passive approach",
    "sprint": "sprints to close range",
    "go_passive": "goes dark",
    "full_salvo": "fires a full salvo",
    "half_salvo": "fires a half salvo",
    "sea_skim": "fires sea-skimming missiles",
    "high_dive": "fires high-dive missiles",
    "ecm_jam": "deploys ECM jamming",
    "damage_control": "conducts damage control",
    "damage_control_final": "conducts final damage control",
    "disengage": "attempts to disengage",
    "pursue": "pursues with secondary weapons",
    "withdraw": "withdraws from engagement",
}


def _naval_action_label(action: str) -> str:
    """Get readable label for a naval action."""
    return _NAVAL_ACTION_LABELS.get(action, action.replace("_", " "))


def naval_turn_narrative(
    player_name: str,
    enemy_name: str,
    player_action: str,
    enemy_action: str,
    result: "NavalTurnResult",
) -> str:
    """Generate narrative for a naval tactical turn."""
    from app.engine.types import NavalTurnResult

    parts = []

    player_verb = _naval_action_label(player_action)
    enemy_verb = _naval_action_label(enemy_action)

    player_fires = player_action in ("full_salvo", "half_salvo", "sea_skim", "high_dive")
    enemy_fires = enemy_action in ("full_salvo", "half_salvo", "sea_skim", "high_dive")

    # Opening — what both sides did
    if player_fires and enemy_fires:
        parts.append(f"Salvos cross in mid-ocean — your {player_name} and the {enemy_name} trade missile fire.")
    elif player_fires:
        parts.append(f"Your {player_name} {player_verb} as the {enemy_name} {enemy_verb}.")
    elif enemy_fires:
        parts.append(f"The {enemy_name} {enemy_verb} while your {player_name} {player_verb}.")
    else:
        parts.append(f"Your {player_name} {player_verb}. The {enemy_name} {enemy_verb}.")

    # Player salvo result
    if result.player_salvo_fired > 0:
        if result.player_hits > 0:
            parts.append(
                f"{result.player_hits} of {result.player_salvo_fired} missiles penetrate defenses — "
                f"{result.player_damage_dealt:.0f}% damage dealt."
            )
            if result.compartment_hit:
                parts.append(f"Enemy {result.compartment_hit} takes the brunt of the impact.")
        else:
            parts.append(f"All {result.player_salvo_fired} missiles are intercepted. The {enemy_name}'s defense holds.")

    # Enemy salvo result
    if result.enemy_salvo_fired > 0:
        if result.enemy_hits > 0:
            parts.append(
                f"Incoming: {result.enemy_hits} of {result.enemy_salvo_fired} enemy missiles get through — "
                f"{result.enemy_damage_taken:.0f}% damage taken!"
            )
        else:
            parts.append(f"Your layered defense intercepts all {result.enemy_salvo_fired} incoming missiles.")

    # Damage control
    if result.damage_repaired > 0:
        parts.append(f"Crew fights to contain damage — {result.damage_repaired:.0f}% repaired.")

    # Intel reveal
    if result.intel_revealed:
        parts.append(f"Scan reveals enemy {result.intel_revealed}.")

    # Pursuit damage
    if player_action == "pursue" and result.player_damage_dealt > 0:
        parts.append(f"Secondary weapons score hits — {result.player_damage_dealt:.0f}% additional damage.")

    # Range change
    if abs(result.range_change) > 5:
        if result.range_change < 0:
            parts.append(f"Range closes to {result.new_range:.0f}km.")
        else:
            parts.append(f"Range opens to {result.new_range:.0f}km.")

    # Phase transition hints
    if result.new_range <= 150 and result.new_range - result.range_change > 150:
        parts.append("Entering missile engagement envelope!")

    return " ".join(parts) if parts else "The battle continues."
