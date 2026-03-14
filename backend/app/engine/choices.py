"""Situational choice effectiveness — the right answer changes based on context."""

from typing import Dict, List
from app.engine.types import ChoiceOption

# ─── AIR COMBAT CHOICES ───

AIR_PHASE_CHOICES: Dict[int, List[ChoiceOption]] = {
    # Phase 2: Detection
    2: [
        ChoiceOption("aggressive_scan", "Aggressive Scan", "Full-power radar sweep for maximum detection range", "medium"),
        ChoiceOption("passive_irst", "Passive IRST", "Use infrared search — stealthy but shorter range", "low"),
        ChoiceOption("early_ecm", "Early ECM", "Activate jamming to degrade enemy radar", "medium"),
    ],
    # Phase 3: BVR Engagement
    3: [
        ChoiceOption("fire_at_rmax", "Fire at Max Range", "Long shot — low hit probability but safe distance", "low"),
        ChoiceOption("close_to_rne", "Close to No-Escape", "Get within no-escape range for best kill probability", "high"),
        ChoiceOption("hold_and_maneuver", "Hold Fire", "Skip the shot — focus on defensive positioning", "low"),
    ],
    # Phase 4: Countermeasures (responding to incoming missile)
    4: [
        ChoiceOption("chaff_break", "Chaff + Break Turn", "Deploy chaff and pull a hard break maneuver", "medium"),
        ChoiceOption("notch_beam", "Notch & Beam", "Turn 90° to the missile — exploit doppler filter gap", "medium"),
        ChoiceOption("ecm_decoy", "ECM + Towed Decoy", "Full electronic countermeasures with decoy deployment", "medium"),
    ],
    # Phase 5: WVR / Close-In
    5: [
        ChoiceOption("ir_missile", "Fire IR Missile", "Heat-seeking missile in close combat", "medium"),
        ChoiceOption("guns_engage", "Guns Engagement", "Close to gun range — high skill, devastating if it works", "high"),
        ChoiceOption("disengage", "Disengage", "Break off and extend away — live to fight another day", "low"),
    ],
    # Phase 6: Damage & Disengage
    6: [
        ChoiceOption("press_attack", "Press Attack", "Continue fighting despite damage", "high"),
        ChoiceOption("rtb", "Return to Base", "Withdraw — preserve the aircraft", "low"),
        ChoiceOption("call_reinforcements", "Call Reinforcements", "Request support — delays but strengthens position", "medium"),
    ],
}

# ─── NAVAL COMBAT CHOICES ───

NAVAL_PHASE_CHOICES: Dict[int, List[ChoiceOption]] = {
    2: [
        ChoiceOption("helicopter_recon", "Helicopter Recon", "Send helicopter for over-the-horizon detection", "medium"),
        ChoiceOption("passive_sonar", "Passive Sonar", "Listen quietly — stealthy but shorter range", "low"),
        ChoiceOption("full_radar_sweep", "Full Radar Sweep", "Maximum power search", "medium"),
    ],
    3: [
        ChoiceOption("full_salvo", "Full Salvo", "Launch all available anti-ship missiles", "high"),
        ChoiceOption("half_salvo", "Half Salvo", "Launch half — keep reserves for second strike", "medium"),
        ChoiceOption("sea_skim_profile", "Sea-Skimming Attack", "Low-altitude approach — harder for SAMs, CIWS effective", "medium"),
    ],
    4: [
        ChoiceOption("observe", "Observe", "Watch enemy defenses engage your salvo — learn their capabilities", "low"),
        ChoiceOption("ecm_support", "ECM Support", "Jam enemy radar to help your missiles penetrate", "medium"),
        ChoiceOption("second_wave", "Second Wave", "Immediately launch follow-up salvo during confusion", "high"),
    ],
    5: [
        ChoiceOption("sam_priority", "SAM Priority", "Prioritize long-range SAM engagement of incoming", "medium"),
        ChoiceOption("ciws_reserve", "CIWS Reserve", "Hold SAMs, rely on close-in weapons — risky but conserves SAMs", "high"),
        ChoiceOption("ecm_decoys", "ECM + Decoys", "Full electronic defense with chaff clouds", "medium"),
    ],
    6: [
        ChoiceOption("pursue", "Pursue", "Close distance to finish the enemy", "high"),
        ChoiceOption("withdraw", "Withdraw", "Disengage and preserve the fleet", "low"),
        ChoiceOption("damage_control", "Damage Control", "Focus on repairs — stabilize before deciding", "medium"),
    ],
}


# ─── SITUATIONAL EFFECTIVENESS TABLE ───
# Maps (choice_key, situation_key) → modifier multiplier
# A modifier > 1.0 boosts the player's outcome, < 1.0 hurts it

# Situation keys for air phase 4 (countermeasures):
#   guidance type of incoming missile: "active_radar", "semi_active_radar", "IR"
#   approach: "head_on", "beam", "tail"
#   altitude: "high", "medium", "low"

AIR_CM_EFFECTIVENESS = {
    # Chaff + break: good vs radar missiles, bad vs IR
    ("chaff_break", "active_radar"): 1.25,
    ("chaff_break", "semi_active_radar"): 1.30,
    ("chaff_break", "IR"): 0.85,
    ("chaff_break", "head_on"): 1.10,
    ("chaff_break", "tail"): 0.90,

    # Notch & beam: excellent vs radar (exploits doppler filter), useless vs IR
    ("notch_beam", "active_radar"): 1.40,
    ("notch_beam", "semi_active_radar"): 1.35,
    ("notch_beam", "IR"): 0.85,
    ("notch_beam", "head_on"): 1.30,
    ("notch_beam", "tail"): 0.80,

    # ECM + decoy: good all-around, best if you have good ECM suite
    ("ecm_decoy", "active_radar"): 1.20,
    ("ecm_decoy", "semi_active_radar"): 1.25,
    ("ecm_decoy", "IR"): 1.10,
    ("ecm_decoy", "head_on"): 1.15,
    ("ecm_decoy", "tail"): 1.15,
}

# BVR engagement effectiveness
AIR_BVR_EFFECTIVENESS = {
    # Fire at max range: safe but low Pk
    ("fire_at_rmax", "detection_advantage"): 1.0,  # neutral — range factor handles Pk
    ("fire_at_rmax", "no_detection_advantage"): 0.85,  # risky if they see you first

    # Close to Rne: best Pk but you're in danger too
    ("close_to_rne", "detection_advantage"): 1.35,  # great if you see them first
    ("close_to_rne", "no_detection_advantage"): 1.10,  # risky — mutual exchange

    # Hold and maneuver: defensive, skip the shot
    ("hold_and_maneuver", "detection_advantage"): 0.7,  # wasted opportunity
    ("hold_and_maneuver", "no_detection_advantage"): 1.20,  # smart — avoid unfavorable exchange
}

# WVR effectiveness
AIR_WVR_EFFECTIVENESS = {
    ("ir_missile", "high_twr"): 1.20,  # agile target but IR is reliable
    ("ir_missile", "low_twr"): 1.35,   # sluggish target — easy IR lock

    ("guns_engage", "high_twr"): 0.90,  # hard to track agile target with guns
    ("guns_engage", "low_twr"): 1.40,   # slow target — guns devastating

    ("disengage", "high_twr"): 1.15,    # smart to disengage vs agile opponent
    ("disengage", "low_twr"): 0.80,     # cowardly — you had the advantage
}


def get_air_choice_modifier(
    phase: int,
    choice: str,
    situation: Dict,
) -> float:
    """Get the effectiveness modifier for an air combat choice given the situation."""
    if phase == 2:
        # Detection — modifiers are applied directly in detection.py
        return 1.0

    if phase == 3:
        # BVR engagement
        has_advantage = situation.get("detection_advantage", False)
        key = "detection_advantage" if has_advantage else "no_detection_advantage"
        return AIR_BVR_EFFECTIVENESS.get((choice, key), 1.0)

    if phase == 4:
        # Countermeasures — combine guidance type and approach angle modifiers
        guidance = situation.get("incoming_guidance", "active_radar")
        approach = situation.get("approach_angle", "head_on")
        mod1 = AIR_CM_EFFECTIVENESS.get((choice, guidance), 1.0)
        mod2 = AIR_CM_EFFECTIVENESS.get((choice, approach), 1.0)
        return (mod1 + mod2) / 2.0  # average the two situation factors

    if phase == 5:
        # WVR
        enemy_twr = situation.get("enemy_twr", 1.0)
        twr_key = "high_twr" if enemy_twr > 1.0 else "low_twr"
        return AIR_WVR_EFFECTIVENESS.get((choice, twr_key), 1.0)

    if phase == 6:
        # Damage & disengage — based on damage state
        player_damage = situation.get("player_damage_pct", 0)
        if choice == "press_attack":
            return 1.30 if player_damage < 30 else 0.70  # great if healthy, terrible if damaged
        elif choice == "rtb":
            return 1.20 if player_damage > 50 else 0.85  # smart if damaged, wasteful if healthy
        elif choice == "call_reinforcements":
            return 1.10  # always decent

    return 1.0


def get_optimal_air_choice(phase: int, situation: Dict) -> str:
    """Determine the optimal choice for a given phase and situation (for what-if analysis)."""
    choices = AIR_PHASE_CHOICES.get(phase, [])
    best_choice = ""
    best_modifier = 0.0
    for c in choices:
        mod = get_air_choice_modifier(phase, c.key, situation)
        if mod > best_modifier:
            best_modifier = mod
            best_choice = c.key
    return best_choice


def rate_choice_quality(modifier: float) -> str:
    """Rate a player's choice quality based on the modifier value."""
    if modifier >= 1.25:
        return "optimal"
    if modifier >= 1.05:
        return "good"
    if modifier >= 0.90:
        return "neutral"
    return "bad"
