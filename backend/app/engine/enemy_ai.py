"""Doctrine-based enemy AI for the tactical battle system."""

import random
from enum import Enum
from typing import Optional


class EnemyDoctrine(str, Enum):
    AGGRESSIVE = "aggressive"
    STANDOFF = "standoff"
    CAUTIOUS = "cautious"
    UNPREDICTABLE = "unpredictable"


# Map aircraft names to doctrine. Unrecognized aircraft default to CAUTIOUS.
AIRCRAFT_DOCTRINE = {
    "Su-30MKI": EnemyDoctrine.AGGRESSIVE,
    "F-15E Strike Eagle": EnemyDoctrine.AGGRESSIVE,
    "F-15C Eagle": EnemyDoctrine.AGGRESSIVE,
    "Su-35S": EnemyDoctrine.AGGRESSIVE,
    "Rafale": EnemyDoctrine.STANDOFF,
    "Eurofighter Typhoon": EnemyDoctrine.STANDOFF,
    "Dassault Rafale": EnemyDoctrine.STANDOFF,
    "F-22 Raptor": EnemyDoctrine.STANDOFF,
    "F-16C Fighting Falcon": EnemyDoctrine.CAUTIOUS,
    "Mirage 2000-5": EnemyDoctrine.CAUTIOUS,
    "F/A-18E Super Hornet": EnemyDoctrine.CAUTIOUS,
    "JF-17 Thunder": EnemyDoctrine.UNPREDICTABLE,
    "HAL Tejas Mk1": EnemyDoctrine.UNPREDICTABLE,
    "Gripen E": EnemyDoctrine.UNPREDICTABLE,
    "MiG-29": EnemyDoctrine.AGGRESSIVE,
    "J-10C": EnemyDoctrine.CAUTIOUS,
}

# Doctrine action preferences by zone
_DOCTRINE_PREFS = {
    EnemyDoctrine.AGGRESSIVE: {
        "BVR": ["fire_bvr", "close", "scan"],
        "TRANSITION": ["fire_bvr", "close", "fire_ir"],
        "WVR": ["fire_ir", "guns", "fire_ir"],
    },
    EnemyDoctrine.STANDOFF: {
        "BVR": ["fire_bvr", "fire_bvr", "scan"],
        "TRANSITION": ["fire_bvr", "extend", "ecm"],
        "WVR": ["extend", "fire_ir", "break_turn"],
    },
    EnemyDoctrine.CAUTIOUS: {
        "BVR": ["scan", "ecm", "fire_bvr"],
        "TRANSITION": ["ecm", "extend", "fire_bvr"],
        "WVR": ["break_turn", "fire_ir", "disengage"],
    },
    EnemyDoctrine.UNPREDICTABLE: {
        "BVR": ["fire_bvr", "close", "ecm"],
        "TRANSITION": ["close", "fire_ir", "extend"],
        "WVR": ["guns", "fire_ir", "break_turn"],
    },
}


def get_doctrine(aircraft_name: str) -> EnemyDoctrine:
    """Get doctrine for an aircraft by name. Defaults to CAUTIOUS."""
    return AIRCRAFT_DOCTRINE.get(aircraft_name, EnemyDoctrine.CAUTIOUS)


def choose_enemy_action(
    doctrine: EnemyDoctrine,
    zone: str,
    enemy_damage_pct: float,
    enemy_fuel_pct: float,
    enemy_has_bvr: bool,
    enemy_has_ir: bool,
    rng: Optional[random.Random] = None,
) -> str:
    """
    Choose an enemy action based on doctrine, zone, and situational factors.
    60% doctrine preference, 30% situational, 10% random.
    """
    if rng is None:
        rng = random.Random()

    # Situational overrides
    if enemy_fuel_pct < 15:
        return "disengage"  # RTB — bingo fuel
    if not enemy_has_bvr and not enemy_has_ir:
        if zone == "WVR":
            return "guns" if rng.random() < 0.5 else "disengage"
        return "disengage"  # winchester
    if enemy_damage_pct > 60:
        # Damaged — prefer to extend or disengage
        if rng.random() < 0.7:
            return "extend" if zone != "WVR" else "disengage"

    roll = rng.random()

    if roll < 0.6:
        # Doctrine preference
        prefs = _DOCTRINE_PREFS.get(doctrine, _DOCTRINE_PREFS[EnemyDoctrine.CAUTIOUS])
        zone_prefs = prefs.get(zone, prefs["BVR"])
        action = rng.choice(zone_prefs)
    elif roll < 0.9:
        # Situational — pick based on zone
        if zone == "BVR":
            action = rng.choice(["fire_bvr", "scan", "close", "ecm"])
        elif zone == "TRANSITION":
            action = rng.choice(["fire_bvr", "fire_ir", "close", "extend", "ecm"])
        else:
            action = rng.choice(["fire_ir", "guns", "break_turn", "extend"])
    else:
        # Random wildcard
        all_actions = ["fire_bvr", "fire_ir", "guns", "scan", "ecm", "close", "extend", "break_turn"]
        action = rng.choice(all_actions)

    # Validate action is possible
    if action == "fire_bvr" and not enemy_has_bvr:
        action = "fire_ir" if enemy_has_ir else "close"
    if action == "fire_ir" and not enemy_has_ir:
        action = "fire_bvr" if enemy_has_bvr else "close"
    if action == "guns" and zone != "WVR":
        action = "close"

    return action
