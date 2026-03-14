"""Air combat battle engine — 6-phase tactical simulation."""

import random
from typing import List, Dict, Any, Optional

from app.engine.types import (
    AircraftData, WeaponData, LoadoutItem, ChoiceOption,
    PhaseResult, BattleState, AfterActionReport,
)
from app.engine.detection import calculate_air_detection
from app.engine.missile import calculate_missile_pk
from app.engine.choices import (
    AIR_PHASE_CHOICES, get_air_choice_modifier, get_optimal_air_choice, rate_choice_quality,
)
from app.engine.narrative import (
    detection_narrative, missile_narrative, wvr_narrative, damage_phase_narrative,
)

# Phase names
PHASE_NAMES = {
    1: "Loadout",
    2: "Detection",
    3: "BVR Engagement",
    4: "Countermeasures",
    5: "Close-In Combat",
    6: "Damage & Disengage",
}


class AirBattleEngine:
    """Stateful air combat engine that processes one phase at a time."""

    def __init__(
        self,
        player_aircraft: AircraftData,
        enemy_aircraft: AircraftData,
        player_loadout: List[LoadoutItem],
        enemy_loadout: List[LoadoutItem],
        contractor_skill: int = 50,
        seed: Optional[int] = None,
    ):
        self.player = player_aircraft
        self.enemy = enemy_aircraft
        self.player_loadout = list(player_loadout)
        self.enemy_loadout = list(enemy_loadout)
        self.contractor_skill = contractor_skill
        self.rng = random.Random(seed)

        # Mutable state
        self.current_phase = 2  # phase 1 (loadout) is pre-resolved
        self.range_km = 250.0  # starting distance
        self.player_fuel_pct = 100.0
        self.player_damage_pct = 0.0
        self.enemy_damage_pct = 0.0
        self.detection_advantage = False
        self.phases_completed: List[PhaseResult] = []
        self.situations: List[Dict] = []  # per-phase situation context

        # Calculate payload weight and TWR
        total_weapon_weight = sum(item.weapon.weight_kg * item.quantity for item in player_loadout)
        self.player_current_weight = player_aircraft.empty_weight_kg + player_aircraft.internal_fuel_kg + total_weapon_weight
        self.player_twr_ratio = self._calc_twr_ratio(player_aircraft, total_weapon_weight)

        enemy_weapon_weight = sum(item.weapon.weight_kg * item.quantity for item in enemy_loadout)
        self.enemy_twr_ratio = self._calc_twr_ratio(enemy_aircraft, enemy_weapon_weight)

    def _calc_twr_ratio(self, aircraft: AircraftData, weapon_weight: int) -> float:
        """Current TWR as fraction of clean TWR. < 1.0 means loaded."""
        loaded_weight = aircraft.empty_weight_kg + aircraft.internal_fuel_kg + weapon_weight
        if aircraft.max_takeoff_weight_kg > 0:
            load_fraction = loaded_weight / aircraft.max_takeoff_weight_kg
            return max(0.5, 1.0 - (load_fraction - 0.5) * 0.5)
        return 1.0

    def _get_best_bvr_weapon(self, loadout: List[LoadoutItem]) -> Optional[LoadoutItem]:
        """Find the best BVR missile in a loadout."""
        bvr = [item for item in loadout if item.weapon.weapon_type == "BVR_AAM" and item.quantity > 0]
        if not bvr:
            return None
        return max(bvr, key=lambda x: x.weapon.max_range_km)

    def _get_best_ir_weapon(self, loadout: List[LoadoutItem]) -> Optional[LoadoutItem]:
        """Find best IR missile."""
        ir = [item for item in loadout if item.weapon.weapon_type == "IR_AAM" and item.quantity > 0]
        if not ir:
            return None
        return max(ir, key=lambda x: x.weapon.base_pk)

    def get_current_state(self) -> BattleState:
        """Return current battle state for frontend display."""
        ammo_info = []
        for item in self.player_loadout:
            if item.quantity > 0:
                ammo_info.append({"weapon_name": item.weapon.name, "remaining": item.quantity, "type": item.weapon.weapon_type})

        return BattleState(
            phase=self.current_phase,
            phase_name=PHASE_NAMES.get(self.current_phase, "Unknown"),
            player_name=self.player.name,
            enemy_name=self.enemy.name,
            range_km=round(self.range_km, 1),
            player_ammo=ammo_info,
            player_fuel_pct=round(self.player_fuel_pct, 1),
            player_damage_pct=round(self.player_damage_pct, 1),
            enemy_damage_pct=round(self.enemy_damage_pct, 1),
            available_choices=AIR_PHASE_CHOICES.get(self.current_phase, []),
            status="in_progress" if self.current_phase <= 6 else "completed",
        )

    def run_phase(self, player_choice: str) -> PhaseResult:
        """Execute the current phase with the player's choice. Returns result and advances state."""
        phase = self.current_phase

        if phase == 2:
            result = self._phase_detection(player_choice)
        elif phase == 3:
            result = self._phase_bvr(player_choice)
        elif phase == 4:
            result = self._phase_countermeasures(player_choice)
        elif phase == 5:
            result = self._phase_wvr(player_choice)
        elif phase == 6:
            result = self._phase_damage(player_choice)
        else:
            result = PhaseResult(
                phase_number=phase,
                phase_name="Unknown",
                player_choice=player_choice,
                choice_quality="neutral",
                factors=[],
                outcome={},
                narrative="Phase not implemented.",
                next_choices=[],
            )

        self.phases_completed.append(result)
        self.current_phase += 1

        # Consume fuel each phase
        self.player_fuel_pct = max(0, self.player_fuel_pct - self.rng.uniform(5, 12))

        # Set next phase choices
        result.next_choices = AIR_PHASE_CHOICES.get(self.current_phase, [])

        return result

    def _phase_detection(self, choice: str) -> PhaseResult:
        detection = calculate_air_detection(self.player, self.enemy, choice)
        self.detection_advantage = detection.first_detect == "player"

        # Close range based on detection outcome
        if self.detection_advantage:
            self.range_km = detection.player_detection_range_km * 0.9
        else:
            self.range_km = detection.enemy_detection_range_km * 0.85

        detection.narrative = detection_narrative(
            self.player.name, self.enemy.name, detection, choice
        )

        situation = {"detection_advantage": self.detection_advantage}
        self.situations.append(situation)

        factors = [
            {"name": f"Your radar ({self.player.radar_type})", "value": f"{self.player.radar_range_km}km", "impact": "info", "description": "Base radar detection range"},
            {"name": f"Enemy RCS", "value": f"{self.enemy.rcs_m2}m²", "impact": "positive" if self.enemy.rcs_m2 > 2 else "negative", "description": f"{'Large' if self.enemy.rcs_m2 > 2 else 'Small'} radar cross-section"},
            {"name": f"Your RCS", "value": f"{self.player.rcs_m2}m²", "impact": "positive" if self.player.rcs_m2 < 2 else "negative", "description": f"{'Low' if self.player.rcs_m2 < 2 else 'High'} signature — {'hard' if self.player.rcs_m2 < 2 else 'easy'} to detect"},
            {"name": "Detection range", "value": f"{detection.player_detection_range_km}km vs {detection.enemy_detection_range_km}km", "impact": "positive" if self.detection_advantage else "negative", "description": f"You detect {'first' if self.detection_advantage else 'second'}"},
        ]

        return PhaseResult(
            phase_number=2,
            phase_name=PHASE_NAMES[2],
            player_choice=choice,
            choice_quality="good",  # detection choices are all situationally valid
            factors=factors,
            outcome={
                "player_detection_range": detection.player_detection_range_km,
                "enemy_detection_range": detection.enemy_detection_range_km,
                "advantage_km": detection.advantage_km,
                "first_detect": detection.first_detect,
            },
            narrative=detection.narrative,
            next_choices=[],
        )

    def _phase_bvr(self, choice: str) -> PhaseResult:
        situation = {"detection_advantage": self.detection_advantage}
        self.situations.append(situation)
        modifier = get_air_choice_modifier(3, choice, situation)
        quality = rate_choice_quality(modifier)

        factors = []
        outcome: Dict[str, Any] = {"player_shot": None, "enemy_shot": None}

        # Player's BVR shot
        if choice in ("fire_at_rmax", "close_to_rne"):
            bvr_weapon_item = self._get_best_bvr_weapon(self.player_loadout)
            if bvr_weapon_item:
                weapon = bvr_weapon_item.weapon
                if choice == "close_to_rne":
                    launch_range = weapon.no_escape_range_km * 1.1
                    self.range_km = launch_range
                else:
                    launch_range = min(self.range_km, weapon.max_range_km * 0.85)

                pk_result = calculate_missile_pk(
                    weapon=weapon,
                    launch_range_km=launch_range,
                    target_ecm_rating=self.enemy.ecm_rating,
                    target_max_g=self.enemy.max_g_load,
                    target_twr_ratio=self.enemy_twr_ratio,
                    player_modifier=modifier,
                    rng=self.rng,
                )
                pk_result.narrative = missile_narrative(weapon.name, self.enemy.name, pk_result, launch_range)

                # Consume ammo
                bvr_weapon_item.quantity -= 1

                if pk_result.hit:
                    self.enemy_damage_pct += self.rng.uniform(30, 60)

                factors = [
                    {"name": f"Launch range", "value": f"{launch_range:.0f}km", "impact": "positive" if launch_range <= weapon.no_escape_range_km else "negative", "description": f"Rne: {weapon.no_escape_range_km}km, Rmax: {weapon.max_range_km}km"},
                    {"name": "Range factor", "value": f"{pk_result.range_factor:.0%}", "impact": "positive" if pk_result.range_factor > 0.7 else "negative", "description": "Missile energy at target distance"},
                    {"name": f"Enemy ECM ({self.enemy.ecm_suite})", "value": f"{pk_result.ecm_factor:.0%}", "impact": "positive" if pk_result.ecm_factor > 0.8 else "negative", "description": f"ECM {self.enemy.ecm_rating} vs ECCM {weapon.eccm_rating}"},
                    {"name": "Evasion factor", "value": f"{pk_result.maneuver_factor:.0%}", "impact": "info", "description": f"Target {self.enemy.max_g_load}G vs missile {weapon.maneuverability_g}G"},
                    {"name": "Payload factor", "value": f"{pk_result.payload_factor:.0%}", "impact": "positive" if pk_result.payload_factor > 1.0 else "info", "description": "Enemy loadout weight affects evasion"},
                ]

                outcome["player_shot"] = {
                    "weapon": weapon.name,
                    "launch_range": launch_range,
                    "pk": pk_result.final_pk,
                    "hit": pk_result.hit,
                    "roll": pk_result.roll,
                    "needed": int(pk_result.final_pk * 100),
                }
                outcome["narrative"] = pk_result.narrative
        else:
            # Hold and maneuver — no shot
            self.range_km -= self.rng.uniform(10, 30)
            outcome["narrative"] = f"You hold fire and maneuver defensively, closing range to {self.range_km:.0f}km."

        # Enemy's BVR shot (simplified — enemy always shoots if they can)
        enemy_bvr = self._get_best_bvr_weapon(self.enemy_loadout)
        if enemy_bvr and self.rng.random() > 0.3:  # 70% chance enemy fires
            enemy_bvr.quantity -= 1
            enemy_launch = self.range_km * self.rng.uniform(0.8, 1.0)
            # Enemy Pk — not shown in detail, just outcome
            enemy_pk = enemy_bvr.weapon.base_pk * 0.7  # simplified
            enemy_hit = self.rng.random() < enemy_pk
            if enemy_hit:
                outcome["enemy_shot"] = {"weapon": enemy_bvr.weapon.name, "hit": True}
                # Damage applied in phase 4 (countermeasures can negate)
            else:
                outcome["enemy_shot"] = {"weapon": enemy_bvr.weapon.name, "hit": False}
            outcome["incoming_missile"] = enemy_bvr.weapon.name
            outcome["incoming_guidance"] = enemy_bvr.weapon.guidance

        return PhaseResult(
            phase_number=3,
            phase_name=PHASE_NAMES[3],
            player_choice=choice,
            choice_quality=quality,
            factors=factors,
            outcome=outcome,
            narrative=outcome.get("narrative", ""),
            next_choices=[],
        )

    def _phase_countermeasures(self, choice: str) -> PhaseResult:
        # Get incoming missile info from previous phase
        prev_outcome = self.phases_completed[-1].outcome if self.phases_completed else {}
        incoming = prev_outcome.get("enemy_shot")
        incoming_guidance = prev_outcome.get("incoming_guidance", "active_radar")

        # Parse guidance to simple category
        if "IR" in incoming_guidance or "ir" in incoming_guidance:
            guidance_cat = "IR"
        elif "semi_active" in incoming_guidance:
            guidance_cat = "semi_active_radar"
        else:
            guidance_cat = "active_radar"

        situation = {
            "incoming_guidance": guidance_cat,
            "approach_angle": "head_on",  # simplified
        }
        self.situations.append(situation)
        modifier = get_air_choice_modifier(4, choice, situation)
        quality = rate_choice_quality(modifier)

        factors = []
        survived = True

        if incoming and incoming.get("hit"):
            # Countermeasures reduce the hit to a probability
            cm_effectiveness = modifier  # higher modifier = better defense
            survive_chance = min(0.9, cm_effectiveness * 0.6)
            survived = self.rng.random() < survive_chance

            if not survived:
                damage = self.rng.uniform(25, 50)
                self.player_damage_pct += damage

            incoming_name = prev_outcome.get("incoming_missile", "missile")
            factors = [
                {"name": "Incoming", "value": incoming_name, "impact": "negative", "description": f"Guidance: {guidance_cat}"},
                {"name": f"Your counter ({choice})", "value": f"{cm_effectiveness:.0%} effectiveness", "impact": "positive" if cm_effectiveness > 1.0 else "negative", "description": f"{'Optimal' if quality == 'optimal' else 'Suboptimal'} counter for {guidance_cat} missile"},
                {"name": "Survive chance", "value": f"{survive_chance:.0%}", "impact": "positive" if survive_chance > 0.5 else "negative", "description": "Combined defense probability"},
                {"name": "Result", "value": "Survived" if survived else "Hit taken", "impact": "positive" if survived else "negative", "description": f"{'Countermeasures effective' if survived else f'Damage taken: {self.player_damage_pct:.0f}%'}"},
            ]
            narrative = (
                f"Incoming {incoming_name}! You deploy {choice.replace('_', ' ')}. "
                + (f"The missile is defeated — your {choice.replace('_', ' ')} worked against the {guidance_cat} seeker."
                   if survived
                   else f"The missile punches through your defenses. Your {self.player.name} takes damage — now at {self.player_damage_pct:.0f}%.")
            )
        else:
            narrative = "No incoming threats this phase. You maintain defensive posture and close range."
            self.range_km = max(5, self.range_km - self.rng.uniform(20, 50))

        return PhaseResult(
            phase_number=4,
            phase_name=PHASE_NAMES[4],
            player_choice=choice,
            choice_quality=quality,
            factors=factors,
            outcome={"survived": survived, "player_damage_pct": self.player_damage_pct},
            narrative=narrative,
            next_choices=[],
        )

    def _phase_wvr(self, choice: str) -> PhaseResult:
        situation = {"enemy_twr": self.enemy_twr_ratio}
        self.situations.append(situation)
        modifier = get_air_choice_modifier(5, choice, situation)
        quality = rate_choice_quality(modifier)

        self.range_km = max(1, self.range_km - self.rng.uniform(30, 80))
        factors = []
        hit = False
        weapon_name = ""

        if choice == "ir_missile":
            ir_item = self._get_best_ir_weapon(self.player_loadout)
            if ir_item:
                weapon_name = ir_item.weapon.name
                ir_item.quantity -= 1
                pk = ir_item.weapon.base_pk * modifier * (1.0 - self.player_damage_pct / 200.0)
                pk = max(0.1, min(0.95, pk))
                roll = self.rng.randint(1, 100)
                hit = roll <= int(pk * 100)
                factors = [
                    {"name": weapon_name, "value": f"Pk: {pk:.0%}", "impact": "positive" if pk > 0.7 else "info", "description": f"Base Pk {ir_item.weapon.base_pk:.0%} × modifier {modifier:.0%}"},
                    {"name": "Roll", "value": f"{roll} vs {int(pk * 100)}", "impact": "positive" if hit else "negative", "description": "Hit" if hit else "Miss"},
                ]
            else:
                factors = [{"name": "No IR missiles", "value": "—", "impact": "negative", "description": "No IR missiles remaining in loadout"}]
        elif choice == "guns_engage":
            weapon_name = "cannon"
            guns_pk = 0.35 * modifier * (1.0 - self.player_damage_pct / 150.0)
            # Skill bonus for guns
            guns_pk *= (0.8 + self.contractor_skill / 250.0)
            guns_pk = max(0.05, min(0.8, guns_pk))
            roll = self.rng.randint(1, 100)
            hit = roll <= int(guns_pk * 100)
            factors = [
                {"name": "Guns Pk", "value": f"{guns_pk:.0%}", "impact": "info", "description": f"Guns require high skill — pilot skill {self.contractor_skill} contributes"},
                {"name": "Roll", "value": f"{roll} vs {int(guns_pk * 100)}", "impact": "positive" if hit else "negative", "description": "Hit" if hit else "Miss"},
            ]
        else:  # disengage
            self.range_km += 50
            factors = [{"name": "Disengage", "value": "Extended to safe distance", "impact": "info", "description": "You break off the engagement"}]

        if hit:
            damage = self.rng.uniform(35, 70)
            self.enemy_damage_pct += damage

        narrative = wvr_narrative(self.player.name, self.enemy.name, choice, hit, weapon_name)

        return PhaseResult(
            phase_number=5,
            phase_name=PHASE_NAMES[5],
            player_choice=choice,
            choice_quality=quality,
            factors=factors,
            outcome={"hit": hit, "enemy_damage_pct": self.enemy_damage_pct, "weapon": weapon_name},
            narrative=narrative,
            next_choices=[],
        )

    def _phase_damage(self, choice: str) -> PhaseResult:
        situation = {"player_damage_pct": self.player_damage_pct}
        self.situations.append(situation)
        modifier = get_air_choice_modifier(6, choice, situation)
        quality = rate_choice_quality(modifier)

        # Final enemy damage from pressing or reinforcements
        if choice == "press_attack" and self.player_damage_pct < 50:
            bonus = self.rng.uniform(10, 25) * modifier
            self.enemy_damage_pct += bonus
        elif choice == "call_reinforcements":
            bonus = self.rng.uniform(15, 30)
            self.enemy_damage_pct += bonus

        narrative = damage_phase_narrative(
            self.player.name, choice, self.player_damage_pct, self.enemy_damage_pct
        )

        factors = [
            {"name": "Your damage", "value": f"{self.player_damage_pct:.0f}%", "impact": "negative" if self.player_damage_pct > 30 else "positive", "description": "Accumulated battle damage"},
            {"name": "Enemy damage", "value": f"{self.enemy_damage_pct:.0f}%", "impact": "positive" if self.enemy_damage_pct > 30 else "negative", "description": "Total damage dealt to enemy"},
        ]

        return PhaseResult(
            phase_number=6,
            phase_name=PHASE_NAMES[6],
            player_choice=choice,
            choice_quality=quality,
            factors=factors,
            outcome={
                "player_damage_pct": self.player_damage_pct,
                "enemy_damage_pct": self.enemy_damage_pct,
            },
            narrative=narrative,
            next_choices=[],
        )

    def get_battle_result(self) -> AfterActionReport:
        """Generate final after-action report."""
        success = self.enemy_damage_pct > self.player_damage_pct and self.enemy_damage_pct >= 30

        # Calculate optimal plays
        optimal_choices = []
        for i, phase_result in enumerate(self.phases_completed):
            phase_num = phase_result.phase_number
            situation = self.situations[i] if i < len(self.situations) else {}
            optimal = get_optimal_air_choice(phase_num, situation)
            optimal_choices.append(optimal)

        # Payout scales with performance
        base_payout = 20000
        if success:
            performance = min(2.0, self.enemy_damage_pct / 50.0)
            payout = int(base_payout * performance)
            rep_change = int(10 * performance)
        else:
            payout = int(base_payout * 0.3)
            rep_change = -5

        summary_parts = []
        if success:
            summary_parts.append(f"Mission success — {self.enemy.name} sustained {self.enemy_damage_pct:.0f}% damage.")
        else:
            summary_parts.append(f"Mission failed — insufficient damage to {self.enemy.name} ({self.enemy_damage_pct:.0f}%).")
        summary_parts.append(f"Your {self.player.name} took {self.player_damage_pct:.0f}% damage.")

        return AfterActionReport(
            success=success,
            phases=self.phases_completed,
            optimal_choices=optimal_choices,
            total_damage_dealt=round(self.enemy_damage_pct, 1),
            total_damage_taken=round(self.player_damage_pct, 1),
            payout=payout,
            reputation_change=rep_change,
            narrative_summary=" ".join(summary_parts),
        )
