"""Combined-arms ground battle simulation engine."""

import random
from typing import List, Dict, Any, Optional

# ── Combat classes ──
UNIT_CLASS: Dict[str, str] = {
    "mbt": "armor", "light_tank": "armor", "ifv": "armor", "tank_destroyer": "armor",
    "infantry": "infantry", "rpg_team": "infantry", "sniper": "infantry",
    "spec_ops": "infantry", "manpads": "infantry",
    "mortar": "artillery", "sph": "artillery", "mlrs": "artillery",
    "drone_isr": "drone", "drone_attack": "drone",
}

# Effectiveness multiplier: (attacker_class, defender_class) → multiplier
COUNTER_TABLE: Dict[tuple, float] = {
    ("armor", "armor"): 0.9, ("armor", "infantry"): 1.4, ("armor", "artillery"): 1.1, ("armor", "drone"): 0.3,
    ("infantry", "armor"): 0.35, ("infantry", "infantry"): 1.0, ("infantry", "artillery"): 0.7, ("infantry", "drone"): 0.5,
    ("artillery", "armor"): 0.85, ("artillery", "infantry"): 1.6, ("artillery", "artillery"): 1.0, ("artillery", "drone"): 0.4,
    ("drone", "armor"): 1.4, ("drone", "infantry"): 0.9, ("drone", "artillery"): 1.3, ("drone", "drone"): 0.6,
}

# Terrain effectiveness modifier per combat class
TERRAIN_MOD: Dict[str, Dict[str, float]] = {
    "urban":    {"armor": 0.55, "infantry": 1.45, "artillery": 0.65, "drone": 0.80},
    "open":     {"armor": 1.40, "infantry": 0.65, "artillery": 1.20, "drone": 1.30},
    "mountain": {"armor": 0.55, "infantry": 1.20, "artillery": 1.40, "drone": 1.20},
    "forest":   {"armor": 0.70, "infantry": 1.35, "artillery": 0.80, "drone": 0.60},
}

# Enemy unit combat powers
ENEMY_UNIT_CP: Dict[str, int] = {
    "infantry": 15, "rpg_team": 20, "sniper": 18, "manpads": 12, "spec_ops": 30,
    "ifv": 40, "light_tank": 50, "mbt": 70, "tank_destroyer": 35,
    "mortar": 22, "sph": 55, "mlrs": 60, "drone_isr": 10, "drone_attack": 55,
}

# Enemy compositions per difficulty
ENEMY_COMPOSITIONS: Dict[int, Dict[str, int]] = {
    1: {"infantry": 4, "rpg_team": 2, "light_tank": 1, "mortar": 1},
    2: {"infantry": 6, "rpg_team": 2, "light_tank": 2, "mbt": 1, "sph": 1, "drone_isr": 1},
    3: {"infantry": 8, "rpg_team": 3, "mbt": 3, "sph": 2, "drone_attack": 1, "drone_isr": 1},
}

# Phase sequence: (turn_num, zone_code, phase_name)
TURN_PHASES = [
    (1, "APPROACH", "Approach & Recon"),
    (2, "FIRES",    "Preparatory Fires"),
    (3, "CONTACT",  "Initial Contact"),
    (4, "ASSAULT",  "Main Assault"),
    (5, "ASSAULT",  "Decisive Engagement"),
    (6, "DECISIVE", "Resolution"),
    (7, "DECISIVE", "Resolution"),
    (8, "DECISIVE", "Resolution"),
]

# Phase attack multipliers (player, enemy) — scales damage dealt
PHASE_MULT: Dict[str, tuple] = {
    "APPROACH": (0.05, 0.03),
    "FIRES":    (0.14, 0.08),
    "CONTACT":  (0.18, 0.14),
    "ASSAULT":  (0.24, 0.19),
    "DECISIVE": (0.28, 0.22),
}

AIRCRAFT_ROLES = {
    "air_superiority": {"label": "Fighter CAP", "ground_bonus": 0.10, "air_denial": True},
    "multirole":       {"label": "Multirole CAS", "ground_bonus": 0.20, "air_denial": False},
    "strike":          {"label": "Ground Attack", "ground_bonus": 0.35, "air_denial": False},
    "interceptor":     {"label": "Interceptor CAP", "ground_bonus": 0.08, "air_denial": True},
}

TERRAIN_LABELS = {
    "urban": "urban terrain", "open": "open desert", "mountain": "mountain passes", "forest": "dense forest"
}


def _narrative(turn: int, zone: str, player_units: List[Dict], enemy_comp: Dict[str, int],
               player_dmg_dealt: float, enemy_dmg_taken: float, units_lost: List[str],
               aircraft_label: Optional[str], isr_active: bool, spec_ops_active: bool,
               terrain: str, rng: random.Random) -> str:
    """Generate a narrative for a ground battle turn."""
    terrain_str = TERRAIN_LABELS.get(terrain, terrain)

    # Best player unit names
    armor_units = [u["name"] for u in player_units if UNIT_CLASS.get(u["unit_type"], "") == "armor" and u["hp_pct"] > 0]
    arty_units = [u["name"] for u in player_units if UNIT_CLASS.get(u["unit_type"], "") == "artillery" and u["hp_pct"] > 0]
    drone_units = [u["name"] for u in player_units if UNIT_CLASS.get(u["unit_type"], "") == "drone" and u["hp_pct"] > 0]

    lead_unit = armor_units[0] if armor_units else (drone_units[0] if drone_units else "Forward elements")

    enemy_types = list(enemy_comp.keys())
    main_enemy = enemy_types[0] if enemy_types else "enemy force"
    enemy_label = main_enemy.replace("_", " ")

    if zone == "APPROACH":
        msgs = [
            f"Forces advance through {terrain_str}. ISR{' confirms' if isr_active else ' reports'} {sum(enemy_comp.values())} enemy units ahead.",
            f"Column moves to contact. {terrain_str.capitalize()} limits visibility. {'Spec Ops team deploys ahead of the main body.' if spec_ops_active else 'Forward scouts establish contact.'}",
            f"Advance underway. Command confirms enemy {enemy_label} units in prepared positions across {terrain_str}.",
        ]
    elif zone == "FIRES":
        if arty_units:
            msgs = [
                f"{arty_units[0]} opens fire at max range. Rounds impact enemy formations. {'ISR drone designates targets — accuracy is excellent.' if isr_active else 'Corrections called in by forward observer.'}",
                f"Preparatory barrage begins. {len(arty_units)} artillery {'systems' if len(arty_units) > 1 else 'system'} hammers enemy defensive line.",
                f"Fire mission underway. {'ISR drone feeds real-time corrections.' if isr_active else 'Artillery adjusts by sound and map.'} Enemy {enemy_label} units scrambling.",
            ]
        else:
            msgs = [
                f"Drone strike run begins. {'Bayraktar' if drone_units else 'Loitering munitions'} circle enemy positions.",
                f"Suppressive fire from {'mortars' if any(u['unit_type'] == 'mortar' for u in player_units) else 'available weapons'}. Enemy hunkers down.",
                f"Forces hold at range and engage with available fires. Enemy {enemy_label} absorbs early casualties.",
            ]
    elif zone == "CONTACT":
        aircraft_str = f"{aircraft_label} strikes enemy armor on first pass. " if aircraft_label else ""
        msgs = [
            f"{lead_unit} makes initial contact with enemy {enemy_label} at 800m. {aircraft_str}Small arms fire exchanged.",
            f"Lead elements push through enemy screen. {aircraft_str}{lead_unit} engages flanking {enemy_label}.",
            f"Forward contact established. {'Air support on station.' if aircraft_label else 'No air cover — forces advance carefully.'} Enemy resistance stiffening.",
        ]
    elif zone == "ASSAULT":
        aircraft_str = f"{aircraft_label} provides close air support. " if aircraft_label else ""
        loss_str = f" {units_lost[0]} is destroyed." if units_lost else ""
        msgs = [
            f"{lead_unit} drives into enemy position under fire. {aircraft_str}Intense close combat.{loss_str}",
            f"Full assault underway. {'Enemy artillery suppressed.' if spec_ops_active else 'Enemy artillery active — take cover.'} {lead_unit} flanks {enemy_label}.{loss_str}",
            f"Main engagement at close range. Both sides taking casualties. {aircraft_str}{lead_unit} pushes toward objective.{loss_str}",
        ]
    else:  # DECISIVE
        if enemy_dmg_taken > 70:
            msgs = [
                f"Enemy force crumbling. {lead_unit} secures the objective. Remaining {enemy_label} units in retreat.",
                f"Decisive breakthrough. Enemy {enemy_label} collapses under combined arms pressure. Objective secured.",
                f"Enemy resistance broken. Survivors scatter. {lead_unit} holds the objective zone.",
            ]
        elif player_dmg_dealt < 30:
            msgs = [
                f"Heavy resistance. Enemy {enemy_label} holds firm. Forces consolidate and call for fire support.",
                f"Stalemate developing. Both sides exhausted. Command evaluates tactical withdrawal.",
                f"Attack stalls. Enemy {enemy_label} dug in. Forces hold current position under fire.",
            ]
        else:
            msgs = [
                f"Battle in the balance. {lead_unit} trades fire with enemy {enemy_label}. Outcome uncertain.",
                f"Grinding engagement. Casualties mounting on both sides. {lead_unit} maintains pressure.",
                f"Close fight. Enemy {enemy_label} at {100 - enemy_dmg_taken:.0f}% strength. {lead_unit} presses the attack.",
            ]

    return rng.choice(msgs)


class GroundBattleEngine:
    """Combined-arms ground battle simulation engine."""

    MAX_TURNS = 6

    def __init__(
        self,
        player_units: List[Dict],        # [{id, name, unit_type, combat_power, anti_armor, anti_infantry, anti_air, survivability, hp_pct}]
        aircraft_role: Optional[str],     # aircraft role string or None
        aircraft_name: Optional[str],     # aircraft name for narrative
        difficulty: int,                  # 1-3
        terrain: str,                     # urban, open, mountain, forest
        enemy_composition: Optional[Dict[str, int]],  # override; None = use default for difficulty
        seed: int = 0,
    ):
        self.player_units = [dict(u) for u in player_units]  # deep copy so we can mutate hp_pct
        self.aircraft_role = aircraft_role
        self.aircraft_name = aircraft_name
        self.difficulty = difficulty
        self.terrain = terrain
        self.enemy_composition = enemy_composition or ENEMY_COMPOSITIONS.get(difficulty, ENEMY_COMPOSITIONS[1])
        self.rng = random.Random(seed)

        # Enemy HP pool (0-100%)
        self.enemy_hp_pct = 100.0
        # Track enemy damage dealt to player
        self.total_player_damage = 0.0
        self.turn = 1
        self.status = "in_progress"
        self.exit_reason: Optional[str] = None
        self.turns_completed: List[Dict] = []

        # Compute enemy total CP for scaling
        self._enemy_cp = sum(
            ENEMY_UNIT_CP.get(utype, 30) * count
            for utype, count in self.enemy_composition.items()
        )
        # Compute player total CP
        self._player_cp = sum(u["combat_power"] for u in self.player_units)

        # Synergy flags
        self._has_isr = any(u["unit_type"] == "drone_isr" and u["hp_pct"] > 0 for u in self.player_units)
        self._has_spec_ops = any(u["unit_type"] == "spec_ops" and u["hp_pct"] > 0 for u in self.player_units)
        self._has_manpads = any(u["unit_type"] == "manpads" and u["hp_pct"] > 0 for u in self.player_units)

    def run_full_battle(self) -> List[Dict]:
        """Run all turns and return serialized turn list."""
        while self.status == "in_progress" and self.turn <= self.MAX_TURNS:
            turn_result = self._run_turn()
            self.turns_completed.append(turn_result)
            self._check_exit()
            self.turn += 1
        return self.turns_completed

    def _run_turn(self) -> Dict:
        phase_data = TURN_PHASES[min(self.turn - 1, len(TURN_PHASES) - 1)]
        zone = phase_data[1]
        p_mult, e_mult = PHASE_MULT.get(zone, (0.18, 0.14))

        # ── Player attack ──
        player_power = self._calc_player_power(zone)
        enemy_main_class = self._enemy_dominant_class()
        raw_damage = player_power * p_mult * self.rng.uniform(0.80, 1.25)
        # Counter vs enemy class
        player_class_avg = self._weighted_player_class_avg(enemy_main_class)
        damage_to_enemy = raw_damage * player_class_avg
        # Terrain modifier (avg player class vs terrain)
        terrain_bonus = self._player_terrain_avg()
        damage_to_enemy *= terrain_bonus
        # ISR bonus to artillery/drones
        if self._has_isr:
            damage_to_enemy *= 1.25
        # Aircraft bonus
        aircraft_bonus = 1.0
        aircraft_label: Optional[str] = None
        if self.aircraft_role and zone not in ("APPROACH",):
            role_info = AIRCRAFT_ROLES.get(self.aircraft_role, AIRCRAFT_ROLES["multirole"])
            aircraft_bonus = 1.0 + role_info["ground_bonus"]
            aircraft_label = f"{self.aircraft_name} ({role_info['label']})" if self.aircraft_name else role_info["label"]
        damage_to_enemy *= aircraft_bonus
        # Spec ops reduces enemy artillery effectiveness (turn 1-2)
        spec_ops_active = self._has_spec_ops and self.turn <= 2

        self.enemy_hp_pct = max(0.0, self.enemy_hp_pct - damage_to_enemy)

        # ── Enemy attack ──
        enemy_power = self._enemy_cp * e_mult * self.rng.uniform(0.80, 1.25)
        # Terrain hurts/helps enemy too (opposite of player)
        enemy_terrain_mod = TERRAIN_MOD.get(self.terrain, {}).get(enemy_main_class, 1.0)
        enemy_power *= enemy_terrain_mod
        # Spec ops sabotage: enemy artillery -40% turns 1-2
        if spec_ops_active:
            enemy_arty_count = sum(v for k, v in self.enemy_composition.items() if UNIT_CLASS.get(k) == "artillery")
            if enemy_arty_count > 0:
                enemy_power *= 0.60
        # MANPADS reduces enemy air drones
        if self._has_manpads and self.aircraft_role and AIRCRAFT_ROLES.get(self.aircraft_role, {}).get("air_denial"):
            enemy_power *= 0.85
        # Difficulty scales enemy power
        enemy_power *= (0.7 + self.difficulty * 0.15)

        # Distribute damage to player units
        units_destroyed = self._distribute_damage(enemy_power)
        self.total_player_damage += enemy_power

        # Range: represents distance to objective (decreases each turn)
        range_km = max(5.0, 100.0 - (self.turn - 1) * 16.0)
        range_change = -16.0 if self.turn > 1 else 0.0

        narrative = _narrative(
            self.turn, zone, self.player_units, self.enemy_composition,
            damage_to_enemy, self.enemy_hp_pct,
            units_destroyed, aircraft_label,
            self._has_isr, spec_ops_active, self.terrain, self.rng,
        )

        return {
            "turn_number": self.turn,
            "player_action": zone.lower(),
            "enemy_action": "defend",
            "weapon_fired": self._lead_unit_name(),
            "shot_hit": damage_to_enemy > 8.0,
            "shot_pk": min(1.0, damage_to_enemy / 25.0),
            "damage_dealt": round(damage_to_enemy, 1),
            "enemy_weapon_fired": enemy_main_class,
            "enemy_shot_hit": enemy_power > 5.0,
            "enemy_shot_pk": min(1.0, enemy_power / 20.0),
            "damage_taken": round(enemy_power, 1),
            "range_change": range_change,
            "new_range": range_km,
            "zone": zone,
            "intel_revealed": "enemy_composition" if self.turn == 1 and self._has_isr else None,
            "fuel_consumed": 0,
            "narrative": narrative,
            "factors": [],
            "units_destroyed": units_destroyed,
            "enemy_hp_pct": round(self.enemy_hp_pct, 1),
            "player_unit_hp": {u["name"]: round(u["hp_pct"], 1) for u in self.player_units},
        }

    def _calc_player_power(self, zone: str) -> float:
        """Total player combat power this turn, with terrain modifiers."""
        total = 0.0
        for u in self.player_units:
            if u["hp_pct"] <= 0:
                continue
            uclass = UNIT_CLASS.get(u["unit_type"], "infantry")
            terrain_mod = TERRAIN_MOD.get(self.terrain, {}).get(uclass, 1.0)
            # ISR drones don't attack directly (their bonus is applied separately)
            if u["unit_type"] == "drone_isr":
                continue
            # In APPROACH phase, only recon fires
            if zone == "APPROACH":
                if u["unit_type"] not in ("drone_isr", "drone_attack", "sniper"):
                    continue
            hp_factor = u["hp_pct"] / 100.0
            total += u["combat_power"] * terrain_mod * hp_factor
        return total

    def _enemy_dominant_class(self) -> str:
        """Most represented combat class in enemy composition by CP."""
        class_cp: Dict[str, float] = {}
        for utype, count in self.enemy_composition.items():
            cls = UNIT_CLASS.get(utype, "infantry")
            class_cp[cls] = class_cp.get(cls, 0) + ENEMY_UNIT_CP.get(utype, 20) * count
        return max(class_cp, key=lambda k: class_cp[k]) if class_cp else "infantry"

    def _weighted_player_class_avg(self, enemy_class: str) -> float:
        """Weighted average counter multiplier from player's classes vs enemy class."""
        total_cp = 0.0
        weighted_counter = 0.0
        for u in self.player_units:
            if u["hp_pct"] <= 0 or u["unit_type"] == "drone_isr":
                continue
            uclass = UNIT_CLASS.get(u["unit_type"], "infantry")
            counter = COUNTER_TABLE.get((uclass, enemy_class), 1.0)
            weighted_counter += u["combat_power"] * counter
            total_cp += u["combat_power"]
        if total_cp == 0:
            return 1.0
        return weighted_counter / total_cp

    def _player_terrain_avg(self) -> float:
        """Average terrain modifier for player's active units."""
        total_cp = 0.0
        weighted_terrain = 0.0
        for u in self.player_units:
            if u["hp_pct"] <= 0 or u["unit_type"] == "drone_isr":
                continue
            uclass = UNIT_CLASS.get(u["unit_type"], "infantry")
            terrain_mod = TERRAIN_MOD.get(self.terrain, {}).get(uclass, 1.0)
            weighted_terrain += u["combat_power"] * terrain_mod
            total_cp += u["combat_power"]
        if total_cp == 0:
            return 1.0
        return weighted_terrain / total_cp

    def _distribute_damage(self, total_damage: float) -> List[str]:
        """Distribute enemy damage across player units. Returns list of destroyed unit names."""
        active = [u for u in self.player_units if u["hp_pct"] > 0]
        if not active:
            return []
        # Weight damage to low-survivability units
        weights = [(100 - u["survivability"] + 10) for u in active]
        total_w = sum(weights)
        destroyed = []
        for i, u in enumerate(active):
            share = (weights[i] / total_w) * total_damage
            # Convert to HP% damage (lower survivability = more damage)
            dmg_pct = share * (1.5 - u["survivability"] / 100.0) * 2.0
            u["hp_pct"] = max(0.0, u["hp_pct"] - dmg_pct)
            if u["hp_pct"] == 0.0:
                destroyed.append(u["name"])
        return destroyed

    def _lead_unit_name(self) -> Optional[str]:
        """Name of the primary attacking unit this turn."""
        priority = ["mbt", "light_tank", "ifv", "drone_attack", "sph", "mlrs", "infantry"]
        for utype in priority:
            for u in self.player_units:
                if u["unit_type"] == utype and u["hp_pct"] > 0:
                    return u["name"]
        return None

    def _check_exit(self):
        """Check if the battle should end."""
        active_units = [u for u in self.player_units if u["hp_pct"] > 0]
        if self.enemy_hp_pct <= 0:
            self.status = "completed"
            self.exit_reason = "enemy_destroyed"
        elif not active_units:
            self.status = "completed"
            self.exit_reason = "player_defeated"
        elif self.turn > self.MAX_TURNS:
            # Winner = whoever has more HP remaining (enemy 0-100 vs player avg 0-100)
            avg_player_hp = sum(u["hp_pct"] for u in self.player_units) / max(len(self.player_units), 1)
            if self.enemy_hp_pct < avg_player_hp * 0.7:
                self.exit_reason = "objective_secured"
            elif avg_player_hp < self.enemy_hp_pct * 0.5:
                self.exit_reason = "tactical_withdrawal"
            else:
                self.exit_reason = "stalemate"
            self.status = "completed"

    def get_battle_result(self) -> Dict[str, Any]:
        """Generate after-action report."""
        success = self.exit_reason in ("enemy_destroyed", "objective_secured")

        avg_player_hp = sum(u["hp_pct"] for u in self.player_units) / max(len(self.player_units), 1)
        enemy_damage_dealt = 100.0 - self.enemy_hp_pct
        player_damage_taken = 100.0 - avg_player_hp

        # Payout scales with success + difficulty
        base = 40000 + self.difficulty * 30000
        payout = int(base * (1.5 if success else 0.4))
        rep_change = int((10 + self.difficulty * 8) * (1 if success else -1))

        exit_narratives = {
            "enemy_destroyed": "Enemy force eliminated. Objective secured.",
            "objective_secured": "Battle won on points. Enemy retreats, objective held.",
            "player_defeated": "Force annihilated. Mission failed.",
            "tactical_withdrawal": "Ordered withdrawal under fire. Mission failed.",
            "stalemate": "Inconclusive engagement. Both sides withdraw.",
        }
        summary = f"{exit_narratives.get(self.exit_reason, 'Battle concluded.')} " \
                  f"Battle lasted {len(self.turns_completed)} turns. " \
                  f"Enemy took {enemy_damage_dealt:.0f}% damage. " \
                  f"Force average HP: {avg_player_hp:.0f}%."

        destroyed_units = [u["name"] for u in self.player_units if u["hp_pct"] <= 0]

        return {
            "success": success,
            "exit_reason": self.exit_reason or "unknown",
            "turns_played": len(self.turns_completed),
            "payout": payout,
            "reputation_change": rep_change,
            "damage_dealt": round(enemy_damage_dealt, 1),
            "damage_taken": round(player_damage_taken, 1),
            "fuel_remaining": 100.0,  # N/A for ground
            "narrative": summary,
            "narrative_summary": summary,
            "destroyed_units": destroyed_units,
            "final_unit_hp": {u["name"]: round(u["hp_pct"], 1) for u in self.player_units},
        }
