"""Variable-length tactical air battle engine (v2)."""

import random
from typing import List, Dict, Any, Optional
from dataclasses import asdict

from app.engine.types import (
    AircraftData, WeaponData, LoadoutItem, TurnAction,
    EnemyIntel, INTEL_REVEAL_ORDER, TurnResult,
    TacticalBattleState, TacticalAfterActionReport,
)
from app.engine.missile import calculate_missile_pk
from app.engine.detection import calculate_air_detection
from app.engine.enemy_ai import get_doctrine, choose_enemy_action
from app.engine.narrative import turn_narrative


# ═══ Zone boundaries ═══
BVR_MIN = 40.0  # >40km = BVR
WVR_MAX = 15.0  # <15km = WVR
# 15-40km = TRANSITION


def _get_zone(range_km: float) -> str:
    if range_km > BVR_MIN:
        return "BVR"
    elif range_km > WVR_MAX:
        return "TRANSITION"
    return "WVR"


class TacticalAirBattleEngine:
    """Turn-based air combat engine with fog of war and variable-length battles."""

    def __init__(
        self,
        player_aircraft: AircraftData,
        enemy_aircraft: AircraftData,
        player_loadout: List[LoadoutItem],
        enemy_loadout: List[LoadoutItem],
        contractor_skill: int = 50,
        fuel_pct: float = 85.0,
        seed: Optional[int] = None,
    ):
        self.player = player_aircraft
        self.enemy = enemy_aircraft
        self.player_loadout = list(player_loadout)
        self.enemy_loadout = list(enemy_loadout)
        self.contractor_skill = contractor_skill
        self.rng = random.Random(seed)

        # State
        self.turn = 1
        self.max_turns = 20
        self.range_km = 250.0
        self.fuel_pct = fuel_pct
        self.damage_pct = 0.0
        self.enemy_damage_pct = 0.0
        self.ecm_charges = max(1, player_aircraft.ecm_rating // 15)  # ~3-6
        self.flare_uses = max(1, player_aircraft.flare_count // 8)  # ~2-4
        self.status = "in_progress"
        self.exit_reason: Optional[str] = None
        self.turns_completed: List[TurnResult] = []

        # Fog of war
        self.enemy_intel = EnemyIntel(name=enemy_aircraft.name)
        self._intel_index = 0  # next reveal in INTEL_REVEAL_ORDER

        # Enemy state tracking
        self.enemy_fuel_pct = 90.0  # assumed
        self.enemy_doctrine = get_doctrine(enemy_aircraft.name)

        # TWR ratios
        total_weapon_weight = sum(item.weapon.weight_kg * item.quantity for item in player_loadout)
        self.player_twr_ratio = self._calc_twr_ratio(player_aircraft, total_weapon_weight)
        enemy_weapon_weight = sum(item.weapon.weight_kg * item.quantity for item in enemy_loadout)
        self.enemy_twr_ratio = self._calc_twr_ratio(enemy_aircraft, enemy_weapon_weight)

    def _calc_twr_ratio(self, aircraft: AircraftData, weapon_weight: int) -> float:
        loaded_weight = aircraft.empty_weight_kg + aircraft.internal_fuel_kg + weapon_weight
        if aircraft.max_takeoff_weight_kg > 0:
            load_fraction = loaded_weight / aircraft.max_takeoff_weight_kg
            return max(0.5, 1.0 - (load_fraction - 0.5) * 0.5)
        return 1.0

    @property
    def zone(self) -> str:
        return _get_zone(self.range_km)

    def _get_best_weapon(self, loadout: List[LoadoutItem], wtype: str) -> Optional[LoadoutItem]:
        items = [i for i in loadout if i.weapon.weapon_type == wtype and i.quantity > 0]
        if not items:
            return None
        if wtype == "BVR_AAM":
            return max(items, key=lambda x: x.weapon.max_range_km)
        return max(items, key=lambda x: x.weapon.base_pk)

    def _has_weapon_type(self, loadout: List[LoadoutItem], wtype: str) -> bool:
        return any(i.weapon.weapon_type == wtype and i.quantity > 0 for i in loadout)

    def _calc_pk_preview(self, weapon: WeaponData) -> float:
        """Calculate estimated Pk for display purposes (no random roll)."""
        from app.engine.missile import clamp

        rne = weapon.no_escape_range_km
        rmax = weapon.max_range_km
        launch_range = self.range_km

        if launch_range <= rne:
            range_factor = 1.0 + (rne - launch_range) / rne * 0.1
        elif launch_range <= rmax:
            range_factor = 1.0 - ((launch_range - rne) / (rmax - rne)) ** 1.5
        else:
            range_factor = 0.05
        range_factor = clamp(range_factor, 0.05, 1.1)

        ecm_delta = self.enemy.ecm_rating - weapon.eccm_rating
        ecm_factor = clamp(1.0 - ecm_delta / 150.0, 0.3, 1.0)

        if self.enemy.max_g_load > 0:
            maneuver_factor = clamp(weapon.maneuverability_g / (self.enemy.max_g_load * 2.5), 0.4, 1.0)
        else:
            maneuver_factor = 1.0

        payload_factor = clamp(1.1 - self.enemy_twr_ratio * 0.15, 0.9, 1.15)

        pk = weapon.base_pk * range_factor * ecm_factor * maneuver_factor * payload_factor
        return round(clamp(pk, 0.02, 0.95), 2)

    def get_available_actions(self) -> List[TurnAction]:
        """Get contextual actions based on current zone and resources."""
        actions: List[TurnAction] = []
        zone = self.zone

        # Scan (always available)
        if self._intel_index < len(INTEL_REVEAL_ORDER):
            next_intel = INTEL_REVEAL_ORDER[self._intel_index]
            actions.append(TurnAction(
                key="scan", label="Scan Target",
                description=f"Scan to reveal enemy {next_intel}",
                risk_hint="low",
            ))

        # Fire BVR
        if zone in ("BVR", "TRANSITION"):
            for item in self.player_loadout:
                if item.weapon.weapon_type == "BVR_AAM" and item.quantity > 0:
                    pk = self._calc_pk_preview(item.weapon)
                    degraded = " (degraded)" if zone == "TRANSITION" else ""
                    actions.append(TurnAction(
                        key=f"fire_bvr_{item.weapon.id}",
                        label=f"Fire {item.weapon.name}",
                        description=f"BVR missile{degraded}, {item.quantity} remaining",
                        risk_hint="medium",
                        weapon_id=item.weapon.id,
                        pk_preview=pk,
                    ))

        # Fire IR
        if zone in ("TRANSITION", "WVR"):
            for item in self.player_loadout:
                if item.weapon.weapon_type == "IR_AAM" and item.quantity > 0:
                    pk = self._calc_pk_preview(item.weapon)
                    actions.append(TurnAction(
                        key=f"fire_ir_{item.weapon.id}",
                        label=f"Fire {item.weapon.name}",
                        description=f"IR missile, {item.quantity} remaining",
                        risk_hint="medium",
                        weapon_id=item.weapon.id,
                        pk_preview=pk,
                    ))

        # Guns (WVR only)
        if zone == "WVR":
            actions.append(TurnAction(
                key="guns", label="Guns",
                description="Close-in cannon engagement",
                risk_hint="high",
            ))

        # ECM
        if self.ecm_charges > 0 and zone in ("BVR", "TRANSITION"):
            actions.append(TurnAction(
                key="ecm", label=f"Deploy ECM ({self.ecm_charges})",
                description="Jam enemy radar, degrade incoming missiles",
                risk_hint="low",
            ))

        # Flares (WVR)
        if self.flare_uses > 0 and zone == "WVR":
            actions.append(TurnAction(
                key="flares", label=f"Flares ({self.flare_uses})",
                description="Decoy IR-guided threats",
                risk_hint="low",
            ))

        # Movement actions
        if zone in ("BVR", "TRANSITION"):
            actions.append(TurnAction(
                key="close", label="Close Range",
                description="Close distance to enemy (-30 to -50km)",
                risk_hint="medium",
            ))
        if zone != "BVR":
            actions.append(TurnAction(
                key="extend", label="Extend Range",
                description="Increase distance (+20 to +40km)",
                risk_hint="low",
            ))
        if zone == "WVR":
            actions.append(TurnAction(
                key="break_turn", label="Break Turn",
                description="Defensive maneuver, gain separation (+10-20km)",
                risk_hint="medium",
            ))

        # Go passive (BVR)
        if zone == "BVR":
            actions.append(TurnAction(
                key="go_passive", label="Go Passive",
                description="Shut down radar, reduce detectability",
                risk_hint="low",
            ))

        # Disengage (always)
        actions.append(TurnAction(
            key="disengage", label="Disengage",
            description="Attempt to break off and RTB",
            risk_hint="low",
        ))

        return actions

    def run_turn(self, action: str, weapon_id: Optional[int] = None) -> TurnResult:
        """Execute one turn with simultaneous resolution."""
        result = TurnResult(
            turn_number=self.turn,
            player_action=action,
            enemy_action="",
            new_range=self.range_km,
            zone=self.zone,
        )

        # ─── Enemy AI decision ───
        enemy_has_bvr = self._has_weapon_type(self.enemy_loadout, "BVR_AAM")
        enemy_has_ir = self._has_weapon_type(self.enemy_loadout, "IR_AAM")
        enemy_action = choose_enemy_action(
            self.enemy_doctrine, self.zone,
            self.enemy_damage_pct, self.enemy_fuel_pct,
            enemy_has_bvr, enemy_has_ir, self.rng,
        )
        result.enemy_action = enemy_action

        # ─── Resolve player action ───
        player_fires = False
        player_maneuvers = action in ("close", "extend", "break_turn", "disengage", "go_passive")

        if action.startswith("fire_bvr_") or action.startswith("fire_ir_"):
            player_fires = True
            # Find the weapon
            wid = weapon_id
            if wid is None:
                # Parse from action key
                parts = action.rsplit("_", 1)
                wid = int(parts[-1]) if parts[-1].isdigit() else None

            fired_item = None
            if wid:
                for item in self.player_loadout:
                    if item.weapon.id == wid and item.quantity > 0:
                        fired_item = item
                        break

            if fired_item:
                fired_item.quantity -= 1
                weapon = fired_item.weapon

                # Evasion bonus if enemy is maneuvering
                enemy_maneuvers = enemy_action in ("close", "extend", "break_turn", "disengage")
                evasion_mod = 0.85 if enemy_maneuvers else 1.0

                pk_result = calculate_missile_pk(
                    weapon=weapon,
                    launch_range_km=self.range_km,
                    target_ecm_rating=self.enemy.ecm_rating,
                    target_max_g=self.enemy.max_g_load,
                    target_twr_ratio=self.enemy_twr_ratio,
                    player_modifier=evasion_mod,
                    rng=self.rng,
                )

                result.weapon_fired = weapon.name
                result.shot_pk = pk_result.final_pk
                result.shot_hit = pk_result.hit

                if pk_result.hit:
                    if weapon.weapon_type == "BVR_AAM":
                        dmg = self.rng.uniform(30, 60)
                    else:
                        dmg = self.rng.uniform(35, 70)
                    self.enemy_damage_pct += dmg
                    result.damage_dealt = round(dmg, 1)

                result.factors.append({
                    "name": weapon.name, "value": f"Pk {pk_result.final_pk:.0%}",
                    "impact": "positive" if pk_result.hit else "negative",
                    "description": f"Roll {pk_result.roll} vs {int(pk_result.final_pk * 100)} needed",
                })

        elif action == "guns":
            player_fires = True
            guns_pk = 0.35 * (0.8 + self.contractor_skill / 250.0) * (1.0 - self.damage_pct / 150.0)
            guns_pk = max(0.05, min(0.8, guns_pk))
            roll = self.rng.randint(1, 100)
            hit = roll <= int(guns_pk * 100)

            result.weapon_fired = "Cannon"
            result.shot_pk = guns_pk
            result.shot_hit = hit

            if hit:
                dmg = self.rng.uniform(15, 40)
                self.enemy_damage_pct += dmg
                result.damage_dealt = round(dmg, 1)

            result.factors.append({
                "name": "Guns", "value": f"Pk {guns_pk:.0%}",
                "impact": "positive" if hit else "negative",
                "description": f"Roll {roll} vs {int(guns_pk * 100)} needed",
            })

        elif action == "scan":
            # Reveal next intel piece
            if self._intel_index < len(INTEL_REVEAL_ORDER):
                field = INTEL_REVEAL_ORDER[self._intel_index]
                self._reveal_intel(field)
                result.intel_revealed = field
                self._intel_index += 1

        elif action == "ecm":
            if self.ecm_charges > 0:
                self.ecm_charges -= 1

        elif action == "flares":
            if self.flare_uses > 0:
                self.flare_uses -= 1

        # ─── Resolve enemy action ───
        enemy_fires = enemy_action in ("fire_bvr", "fire_ir", "guns")

        if enemy_action == "fire_bvr":
            enemy_weapon_item = self._get_best_weapon(self.enemy_loadout, "BVR_AAM")
            if enemy_weapon_item:
                enemy_weapon_item.quantity -= 1
                weapon = enemy_weapon_item.weapon

                # Player maneuver evasion bonus
                maneuver_mod = 0.85 if player_maneuvers else 1.0
                # ECM reduction
                ecm_mod = 0.6 if action == "ecm" else 1.0

                enemy_pk = weapon.base_pk * 0.7 * maneuver_mod * ecm_mod
                enemy_pk = max(0.02, min(0.85, enemy_pk))
                enemy_hit = self.rng.random() < enemy_pk

                result.enemy_weapon_fired = weapon.name
                result.enemy_shot_pk = round(enemy_pk, 3)
                result.enemy_shot_hit = enemy_hit

                if enemy_hit:
                    dmg = self.rng.uniform(30, 60)
                    self.damage_pct += dmg
                    result.damage_taken = round(dmg, 1)

                # Passive intel: learn weapon type
                self._passive_intel_weapon(weapon.name)

        elif enemy_action == "fire_ir":
            enemy_weapon_item = self._get_best_weapon(self.enemy_loadout, "IR_AAM")
            if enemy_weapon_item:
                enemy_weapon_item.quantity -= 1
                weapon = enemy_weapon_item.weapon

                maneuver_mod = 0.85 if player_maneuvers else 1.0
                flare_mod = 0.4 if action == "flares" else 1.0

                enemy_pk = weapon.base_pk * 0.75 * maneuver_mod * flare_mod
                enemy_pk = max(0.02, min(0.90, enemy_pk))
                enemy_hit = self.rng.random() < enemy_pk

                result.enemy_weapon_fired = weapon.name
                result.enemy_shot_pk = round(enemy_pk, 3)
                result.enemy_shot_hit = enemy_hit

                if enemy_hit:
                    dmg = self.rng.uniform(35, 70)
                    self.damage_pct += dmg
                    result.damage_taken = round(dmg, 1)

                self._passive_intel_weapon(weapon.name)

        elif enemy_action == "guns" and self.zone == "WVR":
            enemy_guns_pk = 0.30 * (1.0 - self.enemy_damage_pct / 150.0)
            enemy_guns_pk = max(0.05, min(0.7, enemy_guns_pk))
            enemy_hit = self.rng.random() < enemy_guns_pk

            result.enemy_weapon_fired = "Cannon"
            result.enemy_shot_pk = round(enemy_guns_pk, 3)
            result.enemy_shot_hit = enemy_hit

            if enemy_hit:
                dmg = self.rng.uniform(15, 40)
                self.damage_pct += dmg
                result.damage_taken = round(dmg, 1)

        elif enemy_action == "ecm":
            self._passive_intel_ecm()

        # ─── Range changes ───
        range_change = 0.0

        # Player movement
        if action == "close":
            range_change -= self.rng.uniform(30, 50)
        elif action == "extend":
            range_change += self.rng.uniform(20, 40)
        elif action == "break_turn":
            range_change += self.rng.uniform(10, 20)
        elif action == "disengage":
            range_change += self.rng.uniform(30, 60)

        # Enemy movement
        if enemy_action == "close":
            range_change -= self.rng.uniform(20, 40)
        elif enemy_action == "extend":
            range_change += self.rng.uniform(15, 30)
        elif enemy_action == "break_turn":
            range_change += self.rng.uniform(8, 15)
        elif enemy_action == "disengage":
            range_change += self.rng.uniform(20, 40)

        self.range_km = max(1.0, self.range_km + range_change)
        result.range_change = round(range_change, 1)
        result.new_range = round(self.range_km, 1)
        result.zone = self.zone

        # ─── Fuel consumption ───
        if action in ("break_turn",):
            fuel_cost = self.rng.uniform(10, 15)
        elif action in ("close", "extend", "disengage"):
            fuel_cost = self.rng.uniform(6, 10)
        elif action in ("guns",):
            fuel_cost = self.rng.uniform(8, 12)
        else:
            fuel_cost = self.rng.uniform(3, 5)

        self.fuel_pct = max(0, self.fuel_pct - fuel_cost)
        self.enemy_fuel_pct = max(0, self.enemy_fuel_pct - self.rng.uniform(3, 6))
        result.fuel_consumed = round(fuel_cost, 1)

        # ─── Narrative ───
        result.narrative = turn_narrative(
            self.player.name, self.enemy.name,
            action, enemy_action, result,
        )

        # ─── Advance turn ───
        self.turn += 1
        self.turns_completed.append(result)

        # Check exit conditions
        exit = self._check_exit(action, enemy_action)
        if exit:
            self.status = "completed"
            self.exit_reason = exit

        # Set next actions
        if self.status == "in_progress":
            result.next_actions = self.get_available_actions()

        return result

    def _reveal_intel(self, field: str):
        """Reveal an intel field about the enemy."""
        if field == "radar":
            self.enemy_intel.radar_known = True
            self.enemy_intel.radar_type = self.enemy.radar_type
            self.enemy_intel.radar_range_km = self.enemy.radar_range_km
        elif field == "rcs":
            self.enemy_intel.rcs_known = True
            self.enemy_intel.rcs_m2 = self.enemy.rcs_m2
        elif field == "ecm":
            self.enemy_intel.ecm_known = True
            self.enemy_intel.ecm_suite = self.enemy.ecm_suite
            self.enemy_intel.ecm_rating = self.enemy.ecm_rating
        elif field == "loadout":
            self.enemy_intel.loadout_known = True
        elif field == "fuel":
            self.enemy_intel.fuel_known = True
            self.enemy_intel.fuel_pct = round(self.enemy_fuel_pct, 1)
        elif field == "damage":
            self.enemy_intel.damage_known = True
            self.enemy_intel.damage_pct = round(self.enemy_damage_pct, 1)

    def _passive_intel_weapon(self, weapon_name: str):
        """Passively learn about enemy weapons from them firing."""
        if weapon_name not in self.enemy_intel.observed_weapons:
            self.enemy_intel.observed_weapons.append(weapon_name)

    def _passive_intel_ecm(self):
        """Passively learn ECM suite exists from enemy using it."""
        if not self.enemy_intel.ecm_known:
            self.enemy_intel.ecm_known = True
            self.enemy_intel.ecm_suite = self.enemy.ecm_suite

    def _check_exit(self, player_action: str, enemy_action: str) -> Optional[str]:
        """Check if the battle should end."""
        if self.damage_pct >= 100:
            return "player_destroyed"
        if self.enemy_damage_pct >= 100:
            return "enemy_destroyed"
        if self.fuel_pct <= 0:
            return "player_bingo_fuel"
        if player_action == "disengage":
            # Disengage succeeds if range > 40km or roll succeeds
            if self.range_km > 40 or self.rng.random() < 0.6:
                return "player_disengaged"
        if enemy_action == "disengage":
            if self.range_km > 40 or self.rng.random() < 0.5:
                return "enemy_disengaged"
        # Winchester check
        player_has_ammo = any(i.quantity > 0 for i in self.player_loadout)
        if not player_has_ammo and self.zone != "WVR":
            return "player_winchester"
        if self.turn > self.max_turns:
            return "max_turns_reached"
        return None

    def get_current_state(self) -> TacticalBattleState:
        """Get current battle state for frontend."""
        ammo_info = []
        for item in self.player_loadout:
            if item.quantity > 0:
                ammo_info.append({
                    "weapon_name": item.weapon.name,
                    "weapon_id": item.weapon.id,
                    "remaining": item.quantity,
                    "type": item.weapon.weapon_type,
                })

        intel_dict = {
            "name": self.enemy_intel.name,
            "radar_known": self.enemy_intel.radar_known,
            "rcs_known": self.enemy_intel.rcs_known,
            "ecm_known": self.enemy_intel.ecm_known,
            "loadout_known": self.enemy_intel.loadout_known,
            "fuel_known": self.enemy_intel.fuel_known,
            "damage_known": self.enemy_intel.damage_known,
            "observed_weapons": self.enemy_intel.observed_weapons,
        }
        if self.enemy_intel.radar_known:
            intel_dict["radar_type"] = self.enemy_intel.radar_type
            intel_dict["radar_range_km"] = self.enemy_intel.radar_range_km
        if self.enemy_intel.rcs_known:
            intel_dict["rcs_m2"] = self.enemy_intel.rcs_m2
        if self.enemy_intel.ecm_known:
            intel_dict["ecm_suite"] = self.enemy_intel.ecm_suite
            intel_dict["ecm_rating"] = self.enemy_intel.ecm_rating
        if self.enemy_intel.fuel_known:
            intel_dict["fuel_pct"] = self.enemy_intel.fuel_pct
        if self.enemy_intel.damage_known:
            intel_dict["damage_pct"] = self.enemy_intel.damage_pct

        return TacticalBattleState(
            turn=self.turn,
            max_turns=self.max_turns,
            range_km=round(self.range_km, 1),
            zone=self.zone,
            player_name=self.player.name,
            enemy_intel=intel_dict,
            player_ammo=ammo_info,
            fuel_pct=round(self.fuel_pct, 1),
            damage_pct=round(self.damage_pct, 1),
            ecm_charges=self.ecm_charges,
            flare_uses=self.flare_uses,
            available_actions=self.get_available_actions(),
            status=self.status,
            exit_reason=self.exit_reason,
        )

    def get_battle_result(self) -> TacticalAfterActionReport:
        """Generate after-action report."""
        # Success if enemy took more damage than player
        success = self.enemy_damage_pct > self.damage_pct and self.enemy_damage_pct >= 30

        # Special cases
        if self.exit_reason == "enemy_destroyed":
            success = True
        elif self.exit_reason == "player_destroyed":
            success = False

        # Payout
        base_payout = 20000
        if success:
            performance = min(2.0, self.enemy_damage_pct / 50.0)
            payout = int(base_payout * performance)
            rep_change = int(10 * performance)
        else:
            payout = int(base_payout * 0.3)
            rep_change = -5

        # Bonus for kill
        if self.exit_reason == "enemy_destroyed":
            payout = int(payout * 1.5)
            rep_change = int(rep_change * 1.5)

        exit_narratives = {
            "enemy_destroyed": f"The {self.enemy.name} is destroyed.",
            "player_destroyed": f"Your {self.player.name} has been shot down.",
            "player_bingo_fuel": f"Bingo fuel — your {self.player.name} must RTB immediately.",
            "player_disengaged": f"You successfully disengage from the {self.enemy.name}.",
            "enemy_disengaged": f"The {self.enemy.name} breaks off and escapes.",
            "player_winchester": "Winchester — out of weapons, must disengage.",
            "max_turns_reached": "Engagement time limit reached — both sides withdraw.",
        }

        exit_text = exit_narratives.get(self.exit_reason or "", "Battle concluded.")
        summary = f"Battle lasted {len(self.turns_completed)} turns. {exit_text} "
        if success:
            summary += f"Enemy sustained {self.enemy_damage_pct:.0f}% damage. Mission success."
        else:
            summary += f"Your aircraft took {self.damage_pct:.0f}% damage. Mission failed."

        return TacticalAfterActionReport(
            success=success,
            exit_reason=self.exit_reason or "unknown",
            turns_played=len(self.turns_completed),
            turns=self.turns_completed,
            total_damage_dealt=round(self.enemy_damage_pct, 1),
            total_damage_taken=round(self.damage_pct, 1),
            fuel_remaining=round(self.fuel_pct, 1),
            payout=payout,
            reputation_change=rep_change,
            narrative_summary=summary,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize engine state for storage."""
        return {
            "engine_version": 2,
            "turn": self.turn,
            "range_km": self.range_km,
            "fuel_pct": self.fuel_pct,
            "damage_pct": self.damage_pct,
            "enemy_damage_pct": self.enemy_damage_pct,
            "ecm_charges": self.ecm_charges,
            "flare_uses": self.flare_uses,
            "status": self.status,
            "exit_reason": self.exit_reason,
            "intel_index": self._intel_index,
            "enemy_fuel_pct": self.enemy_fuel_pct,
            "enemy_intel": {
                "name": self.enemy_intel.name,
                "radar_known": self.enemy_intel.radar_known,
                "rcs_known": self.enemy_intel.rcs_known,
                "ecm_known": self.enemy_intel.ecm_known,
                "loadout_known": self.enemy_intel.loadout_known,
                "fuel_known": self.enemy_intel.fuel_known,
                "damage_known": self.enemy_intel.damage_known,
                "observed_weapons": self.enemy_intel.observed_weapons,
            },
            "loadout_remaining": [
                {"weapon_id": item.weapon.id, "quantity": item.quantity}
                for item in self.player_loadout
            ],
            "enemy_loadout_remaining": [
                {"weapon_id": item.weapon.id, "quantity": item.quantity}
                for item in self.enemy_loadout
            ],
        }

    def restore_from_dict(self, state: Dict[str, Any]):
        """Restore engine state from stored dict."""
        self.turn = state.get("turn", 1)
        self.range_km = state.get("range_km", 250.0)
        self.fuel_pct = state.get("fuel_pct", 85.0)
        self.damage_pct = state.get("damage_pct", 0.0)
        self.enemy_damage_pct = state.get("enemy_damage_pct", 0.0)
        self.ecm_charges = state.get("ecm_charges", 3)
        self.flare_uses = state.get("flare_uses", 2)
        self.status = state.get("status", "in_progress")
        self.exit_reason = state.get("exit_reason")
        self._intel_index = state.get("intel_index", 0)
        self.enemy_fuel_pct = state.get("enemy_fuel_pct", 90.0)

        # Restore intel
        intel_data = state.get("enemy_intel", {})
        self.enemy_intel.radar_known = intel_data.get("radar_known", False)
        self.enemy_intel.rcs_known = intel_data.get("rcs_known", False)
        self.enemy_intel.ecm_known = intel_data.get("ecm_known", False)
        self.enemy_intel.loadout_known = intel_data.get("loadout_known", False)
        self.enemy_intel.fuel_known = intel_data.get("fuel_known", False)
        self.enemy_intel.damage_known = intel_data.get("damage_known", False)
        self.enemy_intel.observed_weapons = intel_data.get("observed_weapons", [])
        # Re-reveal stored intel values
        if self.enemy_intel.radar_known:
            self.enemy_intel.radar_type = self.enemy.radar_type
            self.enemy_intel.radar_range_km = self.enemy.radar_range_km
        if self.enemy_intel.rcs_known:
            self.enemy_intel.rcs_m2 = self.enemy.rcs_m2
        if self.enemy_intel.ecm_known:
            self.enemy_intel.ecm_suite = self.enemy.ecm_suite
            self.enemy_intel.ecm_rating = self.enemy.ecm_rating

        # Restore ammo
        for ammo_state in state.get("loadout_remaining", []):
            for item in self.player_loadout:
                if item.weapon.id == ammo_state["weapon_id"]:
                    item.quantity = ammo_state["quantity"]

        for ammo_state in state.get("enemy_loadout_remaining", []):
            for item in self.enemy_loadout:
                if item.weapon.id == ammo_state["weapon_id"]:
                    item.quantity = ammo_state["quantity"]
