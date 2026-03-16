# Battle System Audit & Improvement Plan

**Date:** 2026-03-16
**Scope:** Air v2 bug fixes, frontend UX polish, naval tactical overhaul

---

## Audit Findings Summary

### Air v2 (Tactical Engine) — Bugs

| # | Issue | Severity | Description |
|---|-------|----------|-------------|
| 1 | Damage exceeds 100% | CRITICAL | No min(100) clamp after damage application |
| 2 | RNG non-determinism on resume | CRITICAL | Same seed on engine reconstruction resets RNG state |
| 3 | Winchester stall in TRANSITION | HIGH | Player with 0 ammo in non-WVR zone can't fire but engine doesn't exit |
| 4 | Enemy never goes Winchester | HIGH | No exit check for enemy ammo depletion |
| 5 | Pk preview omits evasion modifier | MEDIUM | Shows higher Pk than actual due to missing enemy maneuver factor |
| 6 | TRANSITION zone no BVR penalty | MEDIUM | Label says "(degraded)" but Pk unchanged |
| 7 | Disengage always succeeds | LOW | Range change guarantees >40km threshold |
| 8 | Scan spam exploit | LOW | 3-5% fuel cost per scan, can learn all 6 intel cheaply |
| 9 | Enemy loadout always 4 of each | LOW | No variance in enemy arsenal |

### Naval Battle — Structural Gaps

- Fixed 6 phases, no tactical depth
- No ship maneuver, no resource pressure
- Compartments field unused in damage model
- Damage control is narrative-only (no actual repair)
- Every naval battle same length and structure

### Frontend UX

| # | Issue | Severity |
|---|-------|----------|
| 1 | Animations block 2-3s of interaction | CRITICAL |
| 2 | No API timeout — UI freezes on slow network | CRITICAL |
| 3 | Font sizes 7-10px unreadable on mobile | CRITICAL |
| 4 | No ammo depletion warning | HIGH |
| 5 | Fuel/ammo not shown in turn result overlay | HIGH |
| 6 | loadout_known & fuel_known intel not displayed | MEDIUM |
| 7 | observed_weapons array never rendered | MEDIUM |
| 8 | fuel_remaining not shown in after-action report | MEDIUM |
| 9 | Combat log lacks fuel/range change entries | LOW |

---

## Workstream A: Air v2 Bug Fixes

### A1. Damage cap at 100%
After every damage application in `tactical_air_battle.py`:
```python
self.enemy_damage_pct = min(100.0, self.enemy_damage_pct)
self.damage_pct = min(100.0, self.damage_pct)
```

### A2. RNG per-turn seeding
At start of `run_turn()`:
```python
self.rng = random.Random(self._base_seed + self.turn)
```
Store `_base_seed` from constructor. Each turn gets deterministic but unique RNG.

### A3. Winchester fix
Replace `_check_exit` winchester logic:
- Player: exit if no BVR/IR ammo AND zone != WVR
- Enemy: add new exit "enemy_winchester" if enemy has no BVR/IR ammo AND zone != WVR
- Enemy winchester = player success (enemy retreats)

### A4. Disengage probability curve
Replace guaranteed disengage with:
```python
disengage_chance = 0.3 + (self.range_km / 200.0)  # 40% at 20km, 55% at 50km, 80% at 100km
```
Contested: enemy closing reduces effective range for the check.

### A5. Pk preview with evasion estimate
Apply 0.925 modifier in `_calc_pk_preview()` (assumes 50% chance enemy maneuvers at 0.85x).
Add "(est.)" to label in `get_available_actions()`.

### A6. TRANSITION zone BVR penalty
In `run_turn()`, when player fires BVR in TRANSITION zone:
```python
zone_mod = 0.85 if self.zone == "TRANSITION" and weapon.weapon_type == "BVR_AAM" else 1.0
```
Apply as additional factor in `calculate_missile_pk()` player_modifier.

---

## Workstream B: Frontend UX Polish

### B1. Non-blocking animations
Refactor TacticalBattleScreen: show result overlay immediately on API return. Animations play behind/alongside overlay. Add "tap to skip" on animation layer.

### B2. API timeout + retry
Add 10s timeout wrapper in api.ts. On timeout: show "Connection slow — Retry?" with button that re-submits same action. Store pending action in state.

### B3. Mobile font size floor
- `text-[7px]` → `text-[9px]`
- `text-[8px]` → `text-[10px]`
- `text-[9px]` → `text-[11px]`
- Minimum tap target: 40px × 40px

### B4. Resource bar in turn result overlay
Compact bar between factors and "NEXT TURN" button showing fuel%, ammo counts, ECM/flare remaining. Red highlight if any critically low.

### B5. Ammo depletion warning
Log entry `[AMMO] weapon_name WINCHESTER` when quantity hits 0. Amber flash on resource strip.

### B6. Complete fog of war display
- `loadout_known` → show weapon name badges under enemy
- `fuel_known` → show fuel % badge
- `observed_weapons` → dimmed badges (passively learned)
- Unknown categories → show "?" placeholder per category

### B7. Combat log enrichment
Per-turn entries for range change, fuel consumption, zone transitions.

---

## Workstream C: Naval Tactical Overhaul

### Design Philosophy
Naval battles should feel **slower, heavier, and more strategic** than air combat. Longer decision windows, multi-salvo exchanges, compartment damage, damage control as a real trade-off.

### Phase Structure: 3 phases with variable sub-rounds

**Phase 1: Approach (1-3 rounds)**
- Range: 350km, closing 30-50km per round
- Actions: full radar, passive sonar, helo recon, go dark, sprint
- Fog of war: scan-based intel reveal (same pattern as air v2)
- Ends when range enters missile envelope

**Phase 2: Exchange (2-6 rounds)**
Salvo-based combat, each round:
- Fire full salvo / half salvo
- Sea-skim profile (harder for SAM, easier for CIWS)
- High-dive profile (easier for SAM, harder for CIWS)
- Hold fire + ECM (jam enemy, reduce incoming)
- Damage control (skip offense, repair 5-10% to a compartment)

Layered defense: SAM → CIWS → hits (existing calculation, per-round)

**Compartment damage system:**
- Engines: affects speed (disengagement ability)
- Radar: affects detection and SAM accuracy
- Weapons: reduces salvo size
- Hull: overall HP — ship sinks at 0%

Each hit damages a random compartment weighted by hit location.

Phase ends: one side sinks, both winchester, or disengage.

**Phase 3: Aftermath (1 round)**
- Pursue / Withdraw / Rescue ops
- Final damage, payout, report

### Enemy AI
Ship doctrines: AGGRESSIVE (full salvos), DEFENSIVE (ECM + damage control), METHODICAL (half salvos, probing).

### New Files
- `backend/app/engine/tactical_naval_battle.py` — new engine
- `backend/app/engine/naval_ai.py` — ship doctrine AI
- `frontend/src/components/battle/TacticalNavalScreen.tsx` — new naval UI
- `backend/tests/test_tactical_naval_battle.py` — tests

### Modified Files
- `backend/app/engine/types.py` — ShipCompartment, NavalTacticalState, NavalTurnResult
- `backend/app/engine/narrative.py` — naval turn narratives
- `backend/app/api/battle.py` — naval v2 branching
- `backend/app/models/battle.py` — engine_version for naval
- `frontend/src/components/battle/BattlePage.tsx` — route to TacticalNavalScreen
- `frontend/src/components/battle/AfterActionReport.tsx` — compartment damage summary

---

## Implementation Order

1. **Workstream A** — Air v2 bug fixes (1 session, do first)
2. **Workstream B** — Frontend UX polish (1-2 sessions, can parallel with A)
3. **Workstream C** — Naval overhaul (2-3 sessions, after A patterns are solid)
