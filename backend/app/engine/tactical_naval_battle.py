"""Variable-length tactical naval battle engine (v2)."""

import random
from typing import List, Dict, Any, Optional

from app.engine.types import (
    ShipData, WeaponData, ShipCompartment,
    NavalTurnAction, NavalTurnResult,
    NavalTacticalState, NavalAfterActionReport,
)
from app.engine.naval_salvo import calculate_salvo_result
from app.engine.naval_ai import get_naval_doctrine, choose_naval_action
from app.engine.narrative import naval_turn_narrative


# ═══ Phase boundaries ═══
APPROACH_MIN_RANGE = 150.0   # >150km = approach
AFTERMATH_MISSILE_THRESHOLD = 0  # both out of missiles → aftermath

# Compartment damage weights when hit
COMPARTMENT_WEIGHTS = {
    "hull": 40,
    "weapons": 25,
    "radar": 20,
    "engines": 15,
}
COMPARTMENT_NAMES = list(COMPARTMENT_WEIGHTS.keys())


def _get_phase(range_km: float, player_missiles: int, enemy_missiles: int,
               disengaging: bool) -> str:
    if disengaging:
        return "aftermath"
    if range_km > APPROACH_MIN_RANGE:
        return "approach"
    if player_missiles <= 0 and enemy_missiles <= 0:
        return "aftermath"
    return "exchange"


class TacticalNavalBattleEngine:
    """Turn-based naval combat engine with compartment damage and salvo exchanges."""

    def __init__(
        self,
        player_ship: ShipData,
        enemy_ship: ShipData,
        seed: Optional[int] = None,
    ):
        self.player = player_ship
        self.enemy = enemy_ship
        self._base_seed = seed or 0
        self.rng = random.Random(seed)

        # State
        self.turn = 1
        self.max_turns = 15
        self.range_km = 350.0
        self.status = "in_progress"
        self.exit_reason: Optional[str] = None
        self.turns_completed: List[NavalTurnResult] = []
        self._disengaging = False
        self._enemy_detected = False  # has player scanned at least once?

        # Compartments
        self.player_compartments = [
            ShipCompartment("engines"), ShipCompartment("radar"),
            ShipCompartment("weapons"), ShipCompartment("hull"),
        ]
        self.enemy_compartments = [
            ShipCompartment("engines"), ShipCompartment("radar"),
            ShipCompartment("weapons"), ShipCompartment("hull"),
        ]
        # Fog of war: which enemy compartments the player knows about
        self._enemy_compartments_revealed = False

        # Missiles remaining
        self.player_missiles_remaining = sum(
            s["count"] for s in player_ship.anti_ship_missiles
        )
        self.enemy_missiles_remaining = sum(
            s["count"] for s in enemy_ship.anti_ship_missiles
        )

        # Defense readiness
        self.player_sam_ready = len(player_ship.sam_systems) > 0
        self.player_ciws_ready = len(player_ship.ciws) > 0

        # ECM charges
        self.ecm_charges = max(1, player_ship.ecm_rating // 20)
        self.enemy_ecm_charges = max(1, enemy_ship.ecm_rating // 20)

        # Enemy AI
        self.enemy_doctrine = get_naval_doctrine(enemy_ship.name)

    @property
    def phase(self) -> str:
        return _get_phase(
            self.range_km, self.player_missiles_remaining,
            self.enemy_missiles_remaining, self._disengaging,
        )

    def _get_compartment(self, compartments: List[ShipCompartment], name: str) -> ShipCompartment:
        for c in compartments:
            if c.name == name:
                return c
        return compartments[0]

    def _worst_compartment(self, compartments: List[ShipCompartment]) -> ShipCompartment:
        return min(compartments, key=lambda c: c.hp_pct)

    def _hull_hp(self, compartments: List[ShipCompartment]) -> float:
        return self._get_compartment(compartments, "hull").hp_pct

    def _avg_hp(self, compartments: List[ShipCompartment]) -> float:
        return sum(c.hp_pct for c in compartments) / len(compartments)

    def _effective_salvo_size(self, total: int, compartments: List[ShipCompartment]) -> int:
        """Reduce salvo size if weapons compartment is damaged."""
        weapons = self._get_compartment(compartments, "weapons")
        if weapons.hp_pct < 50:
            return max(1, total // 2)
        return total

    def _effective_sam_pk_mod(self, compartments: List[ShipCompartment]) -> float:
        """Reduce SAM effectiveness if radar compartment is damaged."""
        radar = self._get_compartment(compartments, "radar")
        if radar.hp_pct < 50:
            return 0.5
        return 1.0

    def _can_disengage(self, compartments: List[ShipCompartment]) -> bool:
        """Can't disengage if engines are heavily damaged."""
        engines = self._get_compartment(compartments, "engines")
        return engines.hp_pct >= 50

    def _range_close_modifier(self, compartments: List[ShipCompartment]) -> float:
        """Reduce range closing if engines are damaged."""
        engines = self._get_compartment(compartments, "engines")
        if engines.hp_pct < 50:
            return 0.5
        return 1.0

    def get_available_actions(self) -> List[NavalTurnAction]:
        """Get contextual actions based on current phase and resources."""
        actions: List[NavalTurnAction] = []
        phase = self.phase

        if phase == "approach":
            actions.append(NavalTurnAction(
                key="scan", label="Scan Target",
                description="Reveal enemy compartment status",
                risk_hint="low",
            ))
            actions.append(NavalTurnAction(
                key="full_radar", label="Full Radar Sweep",
                description="Close range faster (-40 to -60km) but enemy detects you",
                risk_hint="medium",
            ))
            actions.append(NavalTurnAction(
                key="passive_approach", label="Passive Approach",
                description="Close slowly (-20 to -30km), stealthy",
                risk_hint="low",
            ))
            actions.append(NavalTurnAction(
                key="sprint", label="Sprint",
                description="Close fast (-50 to -80km), burns resources",
                risk_hint="high",
            ))
            actions.append(NavalTurnAction(
                key="go_passive", label="Go Passive",
                description="Reduce detectability, minimal range change",
                risk_hint="low",
            ))

        elif phase == "exchange":
            if self.player_missiles_remaining > 0:
                weapons_comp = self._get_compartment(self.player_compartments, "weapons")
                effective_total = self._effective_salvo_size(
                    self.player_missiles_remaining, self.player_compartments
                )

                actions.append(NavalTurnAction(
                    key="full_salvo", label="Full Salvo",
                    description=f"Fire ALL {effective_total} remaining ASMs",
                    risk_hint="high",
                    salvo_size=effective_total,
                ))

                half = max(1, effective_total // 2)
                actions.append(NavalTurnAction(
                    key="half_salvo", label="Half Salvo",
                    description=f"Fire {half} ASMs, conserve remainder",
                    risk_hint="medium",
                    salvo_size=half,
                ))
                actions.append(NavalTurnAction(
                    key="sea_skim", label="Sea-Skim Profile",
                    description=f"Fire {half} at sea-skim (harder for SAM, easier for CIWS)",
                    risk_hint="medium",
                    salvo_size=half,
                ))
                actions.append(NavalTurnAction(
                    key="high_dive", label="High-Dive Profile",
                    description=f"Fire {half} at high-dive (easier for SAM, harder for CIWS)",
                    risk_hint="medium",
                    salvo_size=half,
                ))

            if self.ecm_charges > 0:
                actions.append(NavalTurnAction(
                    key="ecm_jam", label=f"ECM Jam ({self.ecm_charges})",
                    description="Deploy ECM, reduce incoming salvo accuracy by 30%",
                    risk_hint="low",
                ))

            actions.append(NavalTurnAction(
                key="damage_control", label="Damage Control",
                description="Skip offense, repair 8-15% to worst compartment",
                risk_hint="low",
            ))

            if self._can_disengage(self.player_compartments):
                actions.append(NavalTurnAction(
                    key="disengage", label="Disengage",
                    description="Attempt to withdraw from engagement",
                    risk_hint="medium",
                ))

        elif phase == "aftermath":
            actions.append(NavalTurnAction(
                key="pursue", label="Pursue",
                description="Close for secondary weapons (+5-10% damage)",
                risk_hint="high",
            ))
            actions.append(NavalTurnAction(
                key="withdraw", label="Withdraw",
                description="Safe exit from engagement",
                risk_hint="low",
            ))
            actions.append(NavalTurnAction(
                key="damage_control_final", label="Damage Control",
                description="Repair best opportunity before withdrawing",
                risk_hint="low",
            ))

        return actions

    def run_turn(self, action: str) -> NavalTurnResult:
        """Execute one turn with simultaneous resolution."""
        # Deterministic RNG per turn
        self.rng = random.Random(self._base_seed + self.turn)

        phase = self.phase

        result = NavalTurnResult(
            turn_number=self.turn,
            phase=phase,
            player_action=action,
            enemy_action="",
            new_range=self.range_km,
        )

        # ─── Enemy AI decision ───
        enemy_comps = [{"name": c.name, "hp_pct": c.hp_pct} for c in self.enemy_compartments]
        enemy_action = choose_naval_action(
            self.enemy_doctrine, phase,
            enemy_comps, self.enemy_missiles_remaining, self.rng,
        )
        result.enemy_action = enemy_action

        # ─── ECM state for this turn ───
        player_ecm_active = (action == "ecm_jam")
        enemy_ecm_active = (enemy_action == "ecm_jam")

        if player_ecm_active and self.ecm_charges > 0:
            self.ecm_charges -= 1
        if enemy_ecm_active and self.enemy_ecm_charges > 0:
            self.enemy_ecm_charges -= 1

        # ─── Resolve player action ───
        player_fires = action in ("full_salvo", "half_salvo", "sea_skim", "high_dive")
        player_repairs = action in ("damage_control", "damage_control_final")

        if player_fires and self.player_missiles_remaining > 0:
            effective_total = self._effective_salvo_size(
                self.player_missiles_remaining, self.player_compartments
            )

            if action == "full_salvo":
                salvo_size = effective_total
                profile = "mixed"
            elif action == "half_salvo":
                salvo_size = max(1, effective_total // 2)
                profile = "mixed"
            elif action == "sea_skim":
                salvo_size = max(1, effective_total // 2)
                profile = "sea_skim"
            else:  # high_dive
                salvo_size = max(1, effective_total // 2)
                profile = "high_dive"

            # Clamp to what we actually have
            salvo_size = min(salvo_size, self.player_missiles_remaining)
            self.player_missiles_remaining -= salvo_size

            # Get primary ASM weapon
            asm_weapon = self._get_primary_asm(self.player)

            if asm_weapon:
                # Enemy ECM reduces our accuracy
                ecm_mod = 0.7 if enemy_ecm_active else 1.0
                # Damaged enemy radar = weaker SAM defense (handled in salvo calc via modifier)
                radar_mod = self._effective_sam_pk_mod(self.enemy_compartments)

                salvo_result = calculate_salvo_result(
                    missiles_launched=salvo_size,
                    missile_weapon=asm_weapon,
                    enemy_ship=self.enemy,
                    attack_profile=profile,
                    player_modifier=ecm_mod,  # our accuracy modifier
                    rng=self.rng,
                )

                result.player_salvo_fired = salvo_size
                result.player_hits = salvo_result.hits

                # Apply hits to enemy compartments
                if salvo_result.hits > 0:
                    damage = salvo_result.damage_percent
                    result.player_damage_dealt = round(damage, 1)
                    comp_hit = self._apply_compartment_damage(
                        self.enemy_compartments, damage, salvo_result.hits,
                    )
                    result.compartment_hit = comp_hit

                result.factors.append({
                    "name": f"Salvo ({profile})",
                    "value": f"{salvo_size} launched, {salvo_result.hits} hits",
                    "impact": "positive" if salvo_result.hits > 0 else "negative",
                    "description": f"{salvo_result.damage_percent:.0f}% damage dealt",
                })

        elif player_repairs:
            worst = self._worst_compartment(self.player_compartments)
            repair_amount = self.rng.uniform(8, 15)
            old_hp = worst.hp_pct
            worst.hp_pct = min(100.0, worst.hp_pct + repair_amount)
            result.damage_repaired = round(worst.hp_pct - old_hp, 1)
            result.factors.append({
                "name": "Damage Control",
                "value": f"+{result.damage_repaired:.0f}% to {worst.name}",
                "impact": "positive",
                "description": f"{worst.name}: {old_hp:.0f}% → {worst.hp_pct:.0f}%",
            })

        elif action == "scan":
            self._enemy_compartments_revealed = True
            self._enemy_detected = True
            result.intel_revealed = "compartments"
            result.factors.append({
                "name": "Scan",
                "value": "Enemy compartments revealed",
                "impact": "positive",
                "description": "Full damage picture now visible",
            })

        elif action == "disengage":
            pass  # handled in exit conditions

        elif action == "pursue":
            # Secondary weapons damage
            bonus_dmg = self.rng.uniform(5, 10)
            comp_hit = self._apply_compartment_damage(
                self.enemy_compartments, bonus_dmg, 1,
            )
            result.player_damage_dealt = round(bonus_dmg, 1)
            result.compartment_hit = comp_hit
            result.factors.append({
                "name": "Pursuit",
                "value": f"+{bonus_dmg:.0f}% secondary weapons",
                "impact": "positive",
                "description": f"Close-range engagement hits {comp_hit}",
            })

        # ─── Resolve enemy action ───
        enemy_fires = enemy_action in ("full_salvo", "half_salvo", "sea_skim", "high_dive")
        enemy_repairs = enemy_action in ("damage_control", "damage_control_final")

        if enemy_fires and self.enemy_missiles_remaining > 0:
            enemy_effective = self._effective_salvo_size(
                self.enemy_missiles_remaining, self.enemy_compartments
            )

            if enemy_action == "full_salvo":
                enemy_salvo = enemy_effective
                enemy_profile = "mixed"
            elif enemy_action == "half_salvo":
                enemy_salvo = max(1, enemy_effective // 2)
                enemy_profile = "mixed"
            elif enemy_action == "sea_skim":
                enemy_salvo = max(1, enemy_effective // 2)
                enemy_profile = "sea_skim"
            else:  # high_dive
                enemy_salvo = max(1, enemy_effective // 2)
                enemy_profile = "high_dive"

            enemy_salvo = min(enemy_salvo, self.enemy_missiles_remaining)
            self.enemy_missiles_remaining -= enemy_salvo

            enemy_asm = self._get_primary_asm(self.enemy)
            if enemy_asm:
                # Player ECM reduces incoming accuracy
                player_ecm_mod = 0.7 if player_ecm_active else 1.0
                # Damaged player radar = weaker SAM defense
                player_radar_mod = self._effective_sam_pk_mod(self.player_compartments)

                enemy_salvo_result = calculate_salvo_result(
                    missiles_launched=enemy_salvo,
                    missile_weapon=enemy_asm,
                    enemy_ship=self.player,  # player is defending
                    attack_profile=enemy_profile,
                    player_modifier=player_ecm_mod,
                    rng=self.rng,
                )

                result.enemy_salvo_fired = enemy_salvo
                result.enemy_hits = enemy_salvo_result.hits

                if enemy_salvo_result.hits > 0:
                    enemy_damage = enemy_salvo_result.damage_percent
                    result.enemy_damage_taken = round(enemy_damage, 1)
                    self._apply_compartment_damage(
                        self.player_compartments, enemy_damage, enemy_salvo_result.hits,
                    )

                result.factors.append({
                    "name": f"Enemy salvo ({enemy_profile})",
                    "value": f"{enemy_salvo} launched, {enemy_salvo_result.hits} hits",
                    "impact": "negative" if enemy_salvo_result.hits > 0 else "positive",
                    "description": f"{enemy_salvo_result.damage_percent:.0f}% damage taken",
                })

        elif enemy_repairs:
            worst_enemy = self._worst_compartment(self.enemy_compartments)
            repair = self.rng.uniform(8, 15)
            old = worst_enemy.hp_pct
            worst_enemy.hp_pct = min(100.0, worst_enemy.hp_pct + repair)

        elif enemy_action == "pursue":
            bonus = self.rng.uniform(5, 10)
            self._apply_compartment_damage(self.player_compartments, bonus, 1)
            result.enemy_damage_taken += round(bonus, 1)

        # ─── Range changes ───
        range_change = 0.0
        player_range_mod = self._range_close_modifier(self.player_compartments)
        enemy_range_mod = self._range_close_modifier(self.enemy_compartments)

        # Player movement
        if action == "full_radar":
            range_change -= self.rng.uniform(40, 60) * player_range_mod
        elif action == "passive_approach":
            range_change -= self.rng.uniform(20, 30) * player_range_mod
        elif action == "sprint":
            range_change -= self.rng.uniform(50, 80) * player_range_mod
        elif action == "disengage":
            range_change += self.rng.uniform(40, 70) * player_range_mod
        elif action == "withdraw":
            range_change += self.rng.uniform(30, 50) * player_range_mod

        # Enemy movement
        if enemy_action == "full_radar":
            range_change -= self.rng.uniform(30, 50) * enemy_range_mod
        elif enemy_action == "passive_approach":
            range_change -= self.rng.uniform(15, 25) * enemy_range_mod
        elif enemy_action == "sprint":
            range_change -= self.rng.uniform(40, 60) * enemy_range_mod
        elif enemy_action in ("disengage", "withdraw"):
            range_change += self.rng.uniform(30, 50) * enemy_range_mod

        self.range_km = max(5.0, self.range_km + range_change)
        result.range_change = round(range_change, 1)
        result.new_range = round(self.range_km, 1)

        # ─── Narrative ───
        result.narrative = naval_turn_narrative(
            self.player.name, self.enemy.name,
            action, enemy_action, result,
        )

        # ─── Advance turn ───
        self.turn += 1
        self.turns_completed.append(result)

        # Check exit conditions
        exit_reason = self._check_exit(action, enemy_action)
        if exit_reason:
            self.status = "completed"
            self.exit_reason = exit_reason

        # Set next actions
        if self.status == "in_progress":
            result.next_actions = self.get_available_actions()

        return result

    def _get_primary_asm(self, ship: ShipData) -> Optional[WeaponData]:
        """Get the primary anti-ship missile weapon from a ship."""
        if ship.anti_ship_missiles:
            return ship.anti_ship_missiles[0]["weapon"]
        return None

    def _apply_compartment_damage(
        self, compartments: List[ShipCompartment], total_damage: float, hits: int,
    ) -> str:
        """Distribute damage across compartments weighted by COMPARTMENT_WEIGHTS.
        Returns the name of the compartment that took the most damage."""
        # For each hit, pick a compartment weighted randomly
        damage_per_hit = total_damage / max(hits, 1)
        most_damaged_comp = ""
        most_damage = 0.0

        weights = list(COMPARTMENT_WEIGHTS.values())
        names = list(COMPARTMENT_WEIGHTS.keys())

        for _ in range(hits):
            chosen_name = self.rng.choices(names, weights=weights, k=1)[0]
            comp = self._get_compartment(compartments, chosen_name)
            actual_damage = damage_per_hit * self.rng.uniform(0.7, 1.3)
            comp.hp_pct = max(0.0, comp.hp_pct - actual_damage)
            if actual_damage > most_damage:
                most_damage = actual_damage
                most_damaged_comp = chosen_name

        return most_damaged_comp

    def _check_exit(self, player_action: str, enemy_action: str) -> Optional[str]:
        """Check if the battle should end."""
        player_hull = self._hull_hp(self.player_compartments)
        enemy_hull = self._hull_hp(self.enemy_compartments)

        if player_hull <= 0:
            return "player_sunk"
        if enemy_hull <= 0:
            return "enemy_sunk"

        # Disengage attempt
        if player_action == "disengage":
            if self.range_km > 200:
                return "player_disengaged"
            # Contested disengage
            disengage_chance = min(0.90, 0.2 + self.range_km / 300.0)
            if self.rng.random() < disengage_chance:
                self._disengaging = True
                return "player_disengaged"

        if enemy_action == "disengage":
            if self.range_km > 200:
                return "enemy_disengaged"
            disengage_chance = min(0.85, 0.15 + self.range_km / 300.0)
            if self.rng.random() < disengage_chance:
                return "enemy_disengaged"

        # Withdraw in aftermath = clean exit
        if player_action == "withdraw":
            return "player_withdrew"
        if enemy_action == "withdraw":
            return "enemy_withdrew"

        # Both out of missiles + aftermath complete
        if (self.player_missiles_remaining <= 0 and self.enemy_missiles_remaining <= 0
                and self.phase == "aftermath"):
            # Give one aftermath turn, then end
            if self.turn > 2:  # at least played a couple turns
                return "missiles_exhausted"

        if self.turn > self.max_turns:
            return "max_turns_reached"

        return None

    def get_current_state(self) -> NavalTacticalState:
        """Get current battle state for frontend."""
        player_comps = [
            {"name": c.name, "hp_pct": round(c.hp_pct, 1)}
            for c in self.player_compartments
        ]

        # Fog of war on enemy compartments
        if self._enemy_compartments_revealed:
            enemy_comps = [
                {"name": c.name, "hp_pct": round(c.hp_pct, 1)}
                for c in self.enemy_compartments
            ]
        else:
            enemy_comps = [
                {"name": c.name, "hp_pct": "???"}
                for c in self.enemy_compartments
            ]

        return NavalTacticalState(
            turn=self.turn,
            max_turns=self.max_turns,
            phase=self.phase,
            range_km=round(self.range_km, 1),
            player_name=self.player.name,
            enemy_name=self.enemy.name,
            player_compartments=player_comps,
            enemy_compartments_known=enemy_comps,
            player_missiles_remaining=self.player_missiles_remaining,
            player_sam_ready=self.player_sam_ready,
            player_ciws_ready=self.player_ciws_ready,
            ecm_charges=self.ecm_charges,
            available_actions=self.get_available_actions(),
            status=self.status,
            exit_reason=self.exit_reason,
        )

    def get_battle_result(self) -> NavalAfterActionReport:
        """Generate after-action report."""
        player_hull = self._hull_hp(self.player_compartments)
        enemy_hull = self._hull_hp(self.enemy_compartments)
        player_avg = self._avg_hp(self.player_compartments)
        enemy_avg = self._avg_hp(self.enemy_compartments)

        # Total damage dealt/taken (100 - avg compartment hp)
        total_damage_dealt = round(100.0 - enemy_avg, 1)
        total_damage_taken = round(100.0 - player_avg, 1)

        # Success determination
        success = total_damage_dealt > total_damage_taken and total_damage_dealt >= 20

        if self.exit_reason in ("enemy_sunk", "enemy_withdrew"):
            success = True
        elif self.exit_reason == "player_sunk":
            success = False

        # Payout
        base_payout = 30000
        if success:
            performance = min(2.0, total_damage_dealt / 50.0)
            payout = int(base_payout * performance)
            rep_change = int(12 * performance)
        else:
            payout = int(base_payout * 0.3)
            rep_change = -5

        # Bonus for sinking
        if self.exit_reason == "enemy_sunk":
            payout = int(payout * 1.5)
            rep_change = int(rep_change * 1.5)

        # Compartment status
        comp_status = [
            {"name": c.name, "hp_pct": round(c.hp_pct, 1)}
            for c in self.player_compartments
        ]

        # Narrative summary
        exit_narratives = {
            "enemy_sunk": f"The {self.enemy.name} slips beneath the waves. Kill confirmed.",
            "player_sunk": f"Your {self.player.name} has been sunk.",
            "player_disengaged": f"You successfully disengage from the {self.enemy.name}.",
            "enemy_disengaged": f"The {self.enemy.name} breaks off and escapes.",
            "player_withdrew": f"You withdraw from the engagement area.",
            "enemy_withdrew": f"The {self.enemy.name} withdraws. The sea is yours.",
            "missiles_exhausted": "Both sides have exhausted their missile inventories.",
            "max_turns_reached": "Engagement time limit reached — both sides withdraw.",
        }

        exit_text = exit_narratives.get(self.exit_reason or "", "Battle concluded.")
        summary = f"Battle lasted {len(self.turns_completed)} turns. {exit_text} "
        if success:
            summary += f"Enemy sustained {total_damage_dealt:.0f}% average damage. Mission success."
        else:
            summary += f"Your ship took {total_damage_taken:.0f}% average damage. Mission failed."

        return NavalAfterActionReport(
            success=success,
            exit_reason=self.exit_reason or "unknown",
            turns_played=len(self.turns_completed),
            turns=self.turns_completed,
            total_damage_dealt=total_damage_dealt,
            total_damage_taken=total_damage_taken,
            compartment_status=comp_status,
            payout=payout,
            reputation_change=rep_change,
            narrative_summary=summary,
        )

    def to_dict(self) -> Dict[str, Any]:
        """Serialize engine state for storage."""
        return {
            "engine_type": "naval_v2",
            "engine_version": 2,
            "base_seed": self._base_seed,
            "turn": self.turn,
            "range_km": self.range_km,
            "status": self.status,
            "exit_reason": self.exit_reason,
            "disengaging": self._disengaging,
            "enemy_detected": self._enemy_detected,
            "enemy_compartments_revealed": self._enemy_compartments_revealed,
            "player_compartments": [
                {"name": c.name, "hp_pct": c.hp_pct}
                for c in self.player_compartments
            ],
            "enemy_compartments": [
                {"name": c.name, "hp_pct": c.hp_pct}
                for c in self.enemy_compartments
            ],
            "player_missiles_remaining": self.player_missiles_remaining,
            "enemy_missiles_remaining": self.enemy_missiles_remaining,
            "ecm_charges": self.ecm_charges,
            "enemy_ecm_charges": self.enemy_ecm_charges,
        }

    def restore_from_dict(self, state: Dict[str, Any]):
        """Restore engine state from stored dict."""
        self._base_seed = state.get("base_seed", self._base_seed)
        self.turn = state.get("turn", 1)
        self.range_km = state.get("range_km", 350.0)
        self.status = state.get("status", "in_progress")
        self.exit_reason = state.get("exit_reason")
        self._disengaging = state.get("disengaging", False)
        self._enemy_detected = state.get("enemy_detected", False)
        self._enemy_compartments_revealed = state.get("enemy_compartments_revealed", False)
        self.player_missiles_remaining = state.get("player_missiles_remaining", self.player_missiles_remaining)
        self.enemy_missiles_remaining = state.get("enemy_missiles_remaining", self.enemy_missiles_remaining)
        self.ecm_charges = state.get("ecm_charges", self.ecm_charges)
        self.enemy_ecm_charges = state.get("enemy_ecm_charges", self.enemy_ecm_charges)

        # Restore compartments
        for comp_state in state.get("player_compartments", []):
            comp = self._get_compartment(self.player_compartments, comp_state["name"])
            comp.hp_pct = comp_state["hp_pct"]

        for comp_state in state.get("enemy_compartments", []):
            comp = self._get_compartment(self.enemy_compartments, comp_state["name"])
            comp.hp_pct = comp_state["hp_pct"]
