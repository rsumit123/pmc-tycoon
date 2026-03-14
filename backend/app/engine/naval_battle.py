"""Naval combat battle engine — 6-phase tactical simulation."""

import random
from typing import List, Dict, Any, Optional

from app.engine.types import (
    ShipData, WeaponData, ChoiceOption,
    PhaseResult, BattleState, AfterActionReport,
)
from app.engine.detection import calculate_naval_detection
from app.engine.naval_salvo import calculate_salvo_result
from app.engine.choices import (
    NAVAL_PHASE_CHOICES, rate_choice_quality, get_optimal_air_choice,
)
from app.engine.narrative import salvo_narrative

PHASE_NAMES = {
    1: "Fleet Composition",
    2: "Detection",
    3: "Missile Salvo",
    4: "Enemy Defense",
    5: "Counter-Salvo Defense",
    6: "Damage Assessment",
}


class NavalBattleEngine:
    """Stateful naval combat engine."""

    def __init__(
        self,
        player_ship: ShipData,
        enemy_ship: ShipData,
        seed: Optional[int] = None,
    ):
        self.player = player_ship
        self.enemy = enemy_ship
        self.rng = random.Random(seed)

        self.current_phase = 2
        self.range_km = 350.0
        self.player_damage_pct = 0.0
        self.enemy_damage_pct = 0.0
        self.detection_advantage = False
        self.phases_completed: List[PhaseResult] = []
        self.situations: List[Dict] = []

        # Track remaining weapons
        self.player_asm_remaining = sum(s["count"] for s in player_ship.anti_ship_missiles)
        self.player_sam_remaining = sum(s["count"] for s in player_ship.sam_systems)

    def get_current_state(self) -> BattleState:
        ammo = [
            {"weapon_name": "ASM", "remaining": self.player_asm_remaining, "type": "ASM"},
            {"weapon_name": "SAM", "remaining": self.player_sam_remaining, "type": "SAM"},
        ]
        return BattleState(
            phase=self.current_phase,
            phase_name=PHASE_NAMES.get(self.current_phase, "Unknown"),
            player_name=self.player.name,
            enemy_name=self.enemy.name,
            range_km=round(self.range_km, 1),
            player_ammo=ammo,
            player_fuel_pct=100.0,
            player_damage_pct=round(self.player_damage_pct, 1),
            enemy_damage_pct=round(self.enemy_damage_pct, 1),
            available_choices=NAVAL_PHASE_CHOICES.get(self.current_phase, []),
            status="in_progress" if self.current_phase <= 6 else "completed",
        )

    def run_phase(self, player_choice: str) -> PhaseResult:
        phase = self.current_phase

        if phase == 2:
            result = self._phase_detection(player_choice)
        elif phase == 3:
            result = self._phase_salvo(player_choice)
        elif phase == 4:
            result = self._phase_enemy_defense(player_choice)
        elif phase == 5:
            result = self._phase_counter_salvo(player_choice)
        elif phase == 6:
            result = self._phase_damage_assessment(player_choice)
        else:
            result = PhaseResult(phase, "Unknown", player_choice, "neutral", [], {}, "", [])

        self.phases_completed.append(result)
        self.current_phase += 1
        result.next_choices = NAVAL_PHASE_CHOICES.get(self.current_phase, [])
        return result

    def _phase_detection(self, choice: str) -> PhaseResult:
        detection = calculate_naval_detection(self.player, self.enemy, choice)
        self.detection_advantage = detection.first_detect == "player"
        if self.detection_advantage:
            self.range_km = detection.player_detection_range_km * 0.8
        else:
            self.range_km = detection.enemy_detection_range_km * 0.75

        self.situations.append({"detection_advantage": self.detection_advantage})

        narrative = (
            f"Your {self.player.name}'s {self.player.radar_type} detects the {self.enemy.name} at "
            f"{detection.player_detection_range_km}km. "
            + ("You have the first-look advantage." if self.detection_advantage else "The enemy detected you first.")
        )

        return PhaseResult(
            phase_number=2, phase_name=PHASE_NAMES[2], player_choice=choice,
            choice_quality="good",
            factors=[
                {"name": "Your radar", "value": f"{self.player.radar_range_km}km", "impact": "info", "description": self.player.radar_type},
                {"name": "Enemy radar", "value": f"{self.enemy.radar_range_km}km", "impact": "info", "description": self.enemy.radar_type},
                {"name": "Advantage", "value": f"{detection.advantage_km}km {'you' if self.detection_advantage else 'enemy'}", "impact": "positive" if self.detection_advantage else "negative", "description": "Detection edge"},
            ],
            outcome={"first_detect": detection.first_detect, "range_km": self.range_km},
            narrative=narrative, next_choices=[],
        )

    def _phase_salvo(self, choice: str) -> PhaseResult:
        self.situations.append({})
        if not self.player.anti_ship_missiles:
            return PhaseResult(3, PHASE_NAMES[3], choice, "neutral", [], {}, "No anti-ship missiles available.", [])

        asm_system = self.player.anti_ship_missiles[0]
        missile: WeaponData = asm_system["weapon"]
        total_available = asm_system["count"]

        if choice == "full_salvo":
            salvo_size = total_available
            profile = "mixed"
        elif choice == "half_salvo":
            salvo_size = max(1, total_available // 2)
            profile = "mixed"
        else:  # sea_skim_profile
            salvo_size = total_available
            profile = "sea_skim"

        self.player_asm_remaining -= salvo_size

        # Calculate what gets through enemy defense
        salvo_result = calculate_salvo_result(
            missiles_launched=salvo_size,
            missile_weapon=missile,
            enemy_ship=self.enemy,
            attack_profile=profile,
            player_modifier=1.0,
            rng=self.rng,
        )

        self.enemy_damage_pct += salvo_result.damage_percent
        narrative = salvo_narrative(missile.name, self.enemy.name, salvo_result)

        factors = [
            {"name": "Missiles launched", "value": str(salvo_size), "impact": "info", "description": f"{missile.name} × {salvo_size}"},
            {"name": "Attack profile", "value": profile, "impact": "info", "description": "Affects how defenses engage"},
        ]
        for layer in salvo_result.layer_breakdown:
            factors.append({
                "name": layer["layer"], "value": f"Intercepted {layer['intercepted']}",
                "impact": "negative" if layer["intercepted"] > 0 else "positive",
                "description": f"Pk: {layer['effective_pk']:.0%}, {layer['remaining']} leakers remaining",
            })

        return PhaseResult(
            phase_number=3, phase_name=PHASE_NAMES[3], player_choice=choice,
            choice_quality="good",
            factors=factors,
            outcome={"hits": salvo_result.hits, "damage": salvo_result.damage_percent, "leakers": salvo_result.leakers},
            narrative=narrative, next_choices=[],
        )

    def _phase_enemy_defense(self, choice: str) -> PhaseResult:
        self.situations.append({})
        # This phase is observational — player watches their salvo get engaged
        # Choice here modifies follow-up effectiveness
        narrative = f"You observe the {self.enemy.name}'s defense response to your salvo."
        if choice == "ecm_support":
            # ECM boosts next phase
            narrative += " Your ECM disrupts their targeting — your follow-up attacks will be more effective."
        elif choice == "second_wave" and self.player_asm_remaining > 0:
            bonus_damage = self.rng.uniform(5, 15)
            self.enemy_damage_pct += bonus_damage
            narrative += f" You launch an immediate follow-up wave during the confusion — {bonus_damage:.0f}% additional damage!"

        return PhaseResult(
            phase_number=4, phase_name=PHASE_NAMES[4], player_choice=choice,
            choice_quality="good", factors=[], outcome={}, narrative=narrative, next_choices=[],
        )

    def _phase_counter_salvo(self, choice: str) -> PhaseResult:
        self.situations.append({})
        # Enemy fires back
        if not self.enemy.anti_ship_missiles:
            return PhaseResult(5, PHASE_NAMES[5], choice, "good", [], {}, "Enemy has no anti-ship missiles to fire back.", [])

        enemy_asm = self.enemy.anti_ship_missiles[0]
        enemy_missile: WeaponData = enemy_asm["weapon"]
        enemy_salvo = enemy_asm["count"]

        # Player's defense
        defense_modifier = 1.0
        if choice == "sam_priority":
            defense_modifier = 1.15
        elif choice == "ecm_decoys":
            defense_modifier = 1.20
        elif choice == "ciws_reserve":
            defense_modifier = 0.85  # risky

        # Calculate salvo against player
        salvo_result = calculate_salvo_result(
            missiles_launched=enemy_salvo,
            missile_weapon=enemy_missile,
            enemy_ship=self.player,  # player is defending
            attack_profile="mixed",
            player_modifier=defense_modifier,
            rng=self.rng,
        )

        self.player_damage_pct += salvo_result.damage_percent
        narrative = (
            f"The {self.enemy.name} fires {enemy_salvo} {enemy_missile.name} missiles. "
            + (f"Your defenses intercept {enemy_salvo - salvo_result.hits}. "
               f"{salvo_result.hits} hit{'s' if salvo_result.hits != 1 else ''} — "
               f"{salvo_result.damage_percent:.0f}% damage taken."
               if salvo_result.hits > 0 else
               "Your layered defense holds — all missiles intercepted!")
        )

        factors = [
            {"name": "Incoming", "value": f"{enemy_salvo}× {enemy_missile.name}", "impact": "negative", "description": f"Speed Mach {enemy_missile.speed_mach}"},
            {"name": "Your defense", "value": choice.replace("_", " ").title(), "impact": "info", "description": f"Modifier: {defense_modifier:.0%}"},
            {"name": "Leakers", "value": str(salvo_result.hits), "impact": "negative" if salvo_result.hits > 0 else "positive", "description": f"{salvo_result.damage_percent:.0f}% damage"},
        ]

        return PhaseResult(
            phase_number=5, phase_name=PHASE_NAMES[5], player_choice=choice,
            choice_quality=rate_choice_quality(defense_modifier), factors=factors,
            outcome={"hits_taken": salvo_result.hits, "damage": salvo_result.damage_percent},
            narrative=narrative, next_choices=[],
        )

    def _phase_damage_assessment(self, choice: str) -> PhaseResult:
        self.situations.append({"player_damage_pct": self.player_damage_pct})

        if choice == "pursue" and self.player_damage_pct < 50:
            bonus = self.rng.uniform(10, 25)
            self.enemy_damage_pct += bonus
            narrative = f"You close distance and engage the damaged {self.enemy.name}. Additional {bonus:.0f}% damage dealt."
        elif choice == "withdraw":
            narrative = f"You disengage. Your {self.player.name} has taken {self.player_damage_pct:.0f}% damage — preserving the ship."
        else:
            narrative = f"Damage control teams work to stabilize your {self.player.name} at {self.player_damage_pct:.0f}% damage."

        return PhaseResult(
            phase_number=6, phase_name=PHASE_NAMES[6], player_choice=choice,
            choice_quality="good",
            factors=[
                {"name": "Your damage", "value": f"{self.player_damage_pct:.0f}%", "impact": "negative" if self.player_damage_pct > 30 else "positive", "description": ""},
                {"name": "Enemy damage", "value": f"{self.enemy_damage_pct:.0f}%", "impact": "positive" if self.enemy_damage_pct > 30 else "negative", "description": ""},
            ],
            outcome={"player_damage_pct": self.player_damage_pct, "enemy_damage_pct": self.enemy_damage_pct},
            narrative=narrative, next_choices=[],
        )

    def get_battle_result(self) -> AfterActionReport:
        success = self.enemy_damage_pct > self.player_damage_pct and self.enemy_damage_pct >= 25

        base_payout = 30000
        if success:
            performance = min(2.0, self.enemy_damage_pct / 50.0)
            payout = int(base_payout * performance)
            rep_change = int(12 * performance)
        else:
            payout = int(base_payout * 0.3)
            rep_change = -5

        summary = (
            f"{'Victory' if success else 'Defeat'} — {self.enemy.name}: {self.enemy_damage_pct:.0f}% damage, "
            f"{self.player.name}: {self.player_damage_pct:.0f}% damage."
        )

        return AfterActionReport(
            success=success,
            phases=self.phases_completed,
            optimal_choices=[],
            total_damage_dealt=round(self.enemy_damage_pct, 1),
            total_damage_taken=round(self.player_damage_pct, 1),
            payout=payout,
            reputation_change=rep_change,
            narrative_summary=summary,
        )
