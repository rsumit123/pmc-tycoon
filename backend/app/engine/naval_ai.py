"""Doctrine-based enemy AI for the naval tactical battle system (v2)."""

import random
from enum import Enum
from typing import Optional, List, Dict, Any


class NavalDoctrine(str, Enum):
    AGGRESSIVE = "aggressive"   # Full salvos early
    DEFENSIVE = "defensive"     # ECM + damage control priority
    METHODICAL = "methodical"   # Half salvos, probing


# Map ship names to doctrines. Unrecognized ships default to METHODICAL.
SHIP_DOCTRINE = {
    # Aggressive — strike hard, overwhelm defenses
    "Arleigh Burke": NavalDoctrine.AGGRESSIVE,
    "Kirov": NavalDoctrine.AGGRESSIVE,
    "Slava": NavalDoctrine.AGGRESSIVE,
    "Type 055": NavalDoctrine.AGGRESSIVE,
    "Admiral Nakhimov": NavalDoctrine.AGGRESSIVE,
    "Sejong the Great": NavalDoctrine.AGGRESSIVE,

    # Defensive — layered defense, ECM priority
    "Ticonderoga": NavalDoctrine.DEFENSIVE,
    "Horizon": NavalDoctrine.DEFENSIVE,
    "De Zeven Provincien": NavalDoctrine.DEFENSIVE,
    "Kolkata": NavalDoctrine.DEFENSIVE,
    "Hobart": NavalDoctrine.DEFENSIVE,
    "Sachsen": NavalDoctrine.DEFENSIVE,

    # Methodical — probing salvos, measured approach
    "Type 052D": NavalDoctrine.METHODICAL,
    "Alvaro de Bazan": NavalDoctrine.METHODICAL,
    "Formidable": NavalDoctrine.METHODICAL,
    "Valour": NavalDoctrine.METHODICAL,
    "Admiral Gorshkov": NavalDoctrine.METHODICAL,
    "Mogami": NavalDoctrine.METHODICAL,
    "Constellation": NavalDoctrine.METHODICAL,
}


# Doctrine preferences by phase
_NAVAL_DOCTRINE_PREFS = {
    NavalDoctrine.AGGRESSIVE: {
        "approach": ["full_radar", "sprint", "full_radar"],
        "exchange": ["full_salvo", "full_salvo", "half_salvo", "high_dive"],
        "aftermath": ["pursue", "pursue", "damage_control_final"],
    },
    NavalDoctrine.DEFENSIVE: {
        "approach": ["passive_approach", "go_passive", "scan"],
        "exchange": ["ecm_jam", "half_salvo", "damage_control", "sea_skim"],
        "aftermath": ["withdraw", "damage_control_final", "withdraw"],
    },
    NavalDoctrine.METHODICAL: {
        "approach": ["scan", "passive_approach", "full_radar"],
        "exchange": ["half_salvo", "sea_skim", "ecm_jam", "half_salvo"],
        "aftermath": ["damage_control_final", "withdraw", "pursue"],
    },
}


def get_naval_doctrine(ship_name: str) -> NavalDoctrine:
    """Get doctrine for a ship by name. Defaults to METHODICAL."""
    for key, doctrine in SHIP_DOCTRINE.items():
        if key.lower() in ship_name.lower():
            return doctrine
    return NavalDoctrine.METHODICAL


def choose_naval_action(
    doctrine: NavalDoctrine,
    phase: str,
    enemy_compartments: List[Dict[str, Any]],
    enemy_missiles_remaining: int,
    rng: Optional[random.Random] = None,
) -> str:
    """
    Choose an enemy naval action based on doctrine, phase, and situational factors.
    60% doctrine preference, 25% situational, 15% random.
    """
    if rng is None:
        rng = random.Random()

    # Calculate overall damage from compartments
    hull_hp = 100.0
    avg_hp = 100.0
    if enemy_compartments:
        for comp in enemy_compartments:
            if comp["name"] == "hull":
                hull_hp = comp["hp_pct"]
        avg_hp = sum(c["hp_pct"] for c in enemy_compartments) / len(enemy_compartments)

    # --- Situational overrides ---

    # Out of missiles: damage_control or disengage
    if enemy_missiles_remaining <= 0:
        if phase == "exchange":
            return rng.choice(["damage_control", "ecm_jam"])
        if phase == "aftermath":
            return rng.choice(["withdraw", "damage_control_final"])
        return "go_passive"

    # Heavily damaged (avg compartment < 40%): prioritize damage control
    if avg_hp < 40:
        if phase == "exchange":
            if rng.random() < 0.7:
                return "damage_control"
        elif phase == "aftermath":
            return "damage_control_final"

    # Damaged > 60% total (avg < 40 already handled): lean toward repair
    if avg_hp < 60 and phase == "exchange":
        if rng.random() < 0.4:
            return "damage_control"

    roll = rng.random()

    if roll < 0.60:
        # Doctrine preference
        prefs = _NAVAL_DOCTRINE_PREFS.get(doctrine, _NAVAL_DOCTRINE_PREFS[NavalDoctrine.METHODICAL])
        phase_prefs = prefs.get(phase, prefs["exchange"])
        action = rng.choice(phase_prefs)
    elif roll < 0.85:
        # Situational — pick based on phase
        if phase == "approach":
            action = rng.choice(["scan", "full_radar", "passive_approach", "sprint"])
        elif phase == "exchange":
            action = rng.choice(["full_salvo", "half_salvo", "sea_skim", "high_dive", "ecm_jam", "damage_control"])
        else:
            action = rng.choice(["pursue", "withdraw", "damage_control_final"])
    else:
        # Random wildcard
        if phase == "approach":
            action = rng.choice(["scan", "full_radar", "passive_approach", "sprint", "go_passive"])
        elif phase == "exchange":
            action = rng.choice(["full_salvo", "half_salvo", "sea_skim", "high_dive", "ecm_jam", "damage_control", "disengage"])
        else:
            action = rng.choice(["pursue", "withdraw", "damage_control_final"])

    return action
