"""Battle API — stateful endpoints for the 6-phase tactical battle system."""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.battle import Battle, BattlePhase, BattleType, BattleStatus
from app.models.contract import MissionTemplate, ActiveContract, MissionStatus, MissionLog
from app.models.aircraft import Aircraft
from app.models.ship import Ship
from app.models.weapon import Weapon
from app.models.contractor import OwnedContractor, ContractorTemplate
from app.models.owned_weapon import OwnedWeapon
from app.models.owned_aircraft import OwnedAircraft
from app.models.subsystem import AircraftSubsystem
from app.models.user import User
from app.schemas.battle import BattleCreate, LoadoutSubmit, BattleChoiceSubmit, TacticalChoiceSubmit

from app.engine.types import AircraftData, WeaponData, ShipData, LoadoutItem
from app.engine.air_battle import AirBattleEngine
from app.engine.naval_battle import NavalBattleEngine
from app.engine.tactical_air_battle import TacticalAirBattleEngine
from app.engine.choices import AIR_PHASE_CHOICES, NAVAL_PHASE_CHOICES

router = APIRouter(prefix="/battle", tags=["battle"])


# ─── Helpers to convert DB models to engine dataclasses ───

def aircraft_to_data(a: Aircraft) -> AircraftData:
    return AircraftData(
        id=a.id, name=a.name, origin=a.origin, role=a.role, generation=a.generation,
        max_speed_mach=a.max_speed_mach, max_speed_loaded_mach=a.max_speed_loaded_mach,
        combat_radius_km=a.combat_radius_km, service_ceiling_ft=a.service_ceiling_ft,
        max_g_load=a.max_g_load, thrust_to_weight_clean=a.thrust_to_weight_clean,
        wing_loading_kg_m2=a.wing_loading_kg_m2,
        instantaneous_turn_rate_deg_s=a.instantaneous_turn_rate_deg_s,
        sustained_turn_rate_deg_s=a.sustained_turn_rate_deg_s,
        empty_weight_kg=a.empty_weight_kg, max_takeoff_weight_kg=a.max_takeoff_weight_kg,
        internal_fuel_kg=a.internal_fuel_kg, max_payload_kg=a.max_payload_kg,
        hardpoints=a.hardpoints, radar_type=a.radar_type, radar_range_km=a.radar_range_km,
        rcs_m2=a.rcs_m2, irst=a.irst, ecm_suite=a.ecm_suite or "",
        ecm_rating=a.ecm_rating, chaff_count=a.chaff_count, flare_count=a.flare_count,
        towed_decoy=a.towed_decoy,
    )


def weapon_to_data(w: Weapon) -> WeaponData:
    return WeaponData(
        id=w.id, name=w.name, weapon_type=w.weapon_type.value, weight_kg=w.weight_kg,
        max_range_km=w.max_range_km, no_escape_range_km=w.no_escape_range_km,
        min_range_km=w.min_range_km, speed_mach=w.speed_mach, guidance=w.guidance,
        seeker_generation=w.seeker_generation, base_pk=w.base_pk, warhead_kg=w.warhead_kg,
        eccm_rating=w.eccm_rating, maneuverability_g=w.maneuverability_g,
    )


def ship_to_data(s: Ship, db: Session) -> ShipData:
    """Convert Ship model to ShipData, resolving weapon system references."""
    def resolve_weapons(json_str: str | None):
        if not json_str:
            return []
        items = json.loads(json_str)
        result = []
        for item in items:
            w = db.query(Weapon).filter(Weapon.id == item["weapon_id"]).first()
            if w:
                result.append({"weapon": weapon_to_data(w), "count": item["count"]})
        return result

    return ShipData(
        id=s.id, name=s.name, class_name=s.class_name, origin=s.origin,
        ship_type=s.ship_type.value, displacement_tons=s.displacement_tons,
        max_speed_knots=s.max_speed_knots, radar_type=s.radar_type,
        radar_range_km=s.radar_range_km, ecm_suite=s.ecm_suite or "",
        ecm_rating=s.ecm_rating, compartments=s.compartments,
        anti_ship_missiles=resolve_weapons(s.anti_ship_missiles),
        sam_systems=resolve_weapons(s.sam_systems),
        ciws=resolve_weapons(s.ciws),
    )


def _build_air_engine(battle: Battle, db: Session) -> AirBattleEngine:
    """Reconstruct an AirBattleEngine from a Battle record."""
    player_ac = db.query(Aircraft).filter(Aircraft.id == battle.player_aircraft_id).first()
    enemy_ac = db.query(Aircraft).filter(Aircraft.id == battle.enemy_aircraft_id).first()
    if not player_ac or not enemy_ac:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    # Parse loadout
    loadout_data = json.loads(battle.player_loadout) if battle.player_loadout else []
    player_loadout = []
    for item in loadout_data:
        w = db.query(Weapon).filter(Weapon.id == item["weapon_id"]).first()
        if w:
            player_loadout.append(LoadoutItem(weapon_to_data(w), item["quantity"]))

    # Build a basic enemy loadout from compatible weapons
    enemy_compat = json.loads(player_ac.compatible_weapons) if player_ac.compatible_weapons else []
    # Use enemy's compatible weapons instead
    enemy_compat_ids = json.loads(enemy_ac.compatible_weapons) if enemy_ac.compatible_weapons else []
    enemy_loadout = []
    for wid in enemy_compat_ids:
        if wid:
            w = db.query(Weapon).filter(Weapon.id == wid).first()
            if w:
                enemy_loadout.append(LoadoutItem(weapon_to_data(w), 4))

    # Get contractor skill
    contractor_skill = 50
    if battle.contractor_id:
        oc = db.query(OwnedContractor).filter(OwnedContractor.id == battle.contractor_id).first()
        if oc:
            contractor_skill = oc.skill_level

    engine = AirBattleEngine(
        player_aircraft=aircraft_to_data(player_ac),
        enemy_aircraft=aircraft_to_data(enemy_ac),
        player_loadout=player_loadout,
        enemy_loadout=enemy_loadout,
        contractor_skill=contractor_skill,
        seed=battle.id * 1000 + battle.current_phase,  # deterministic per battle+phase
    )

    # Replay existing phases to restore state
    if battle.battle_state:
        state = json.loads(battle.battle_state)
        engine.current_phase = state.get("current_phase", 2)
        engine.range_km = state.get("range_km", 250.0)
        engine.player_fuel_pct = state.get("player_fuel_pct", 100.0)
        engine.player_damage_pct = state.get("player_damage_pct", 0.0)
        engine.enemy_damage_pct = state.get("enemy_damage_pct", 0.0)
        engine.detection_advantage = state.get("detection_advantage", False)
        engine.situations = state.get("situations", [])
        # Restore ammo
        for ammo_state in state.get("loadout_remaining", []):
            for item in engine.player_loadout:
                if item.weapon.id == ammo_state["weapon_id"]:
                    item.quantity = ammo_state["quantity"]

    return engine


def _build_tactical_air_engine(battle: Battle, db: Session) -> TacticalAirBattleEngine:
    """Reconstruct a TacticalAirBattleEngine from a Battle record."""
    player_ac = db.query(Aircraft).filter(Aircraft.id == battle.player_aircraft_id).first()
    enemy_ac = db.query(Aircraft).filter(Aircraft.id == battle.enemy_aircraft_id).first()
    if not player_ac or not enemy_ac:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    # Parse loadout
    loadout_data = json.loads(battle.player_loadout) if battle.player_loadout else []
    player_loadout = []
    for item in loadout_data:
        w = db.query(Weapon).filter(Weapon.id == item["weapon_id"]).first()
        if w:
            player_loadout.append(LoadoutItem(weapon_to_data(w), item["quantity"]))

    # Build enemy loadout
    enemy_compat_ids = json.loads(enemy_ac.compatible_weapons) if enemy_ac.compatible_weapons else []
    enemy_loadout = []
    for wid in enemy_compat_ids:
        if wid:
            w = db.query(Weapon).filter(Weapon.id == wid).first()
            if w:
                enemy_loadout.append(LoadoutItem(weapon_to_data(w), 4))

    # Get contractor skill
    contractor_skill = 50
    if battle.contractor_id:
        oc = db.query(OwnedContractor).filter(OwnedContractor.id == battle.contractor_id).first()
        if oc:
            contractor_skill = oc.skill_level

    # Get fuel from stored state or default
    fuel_pct = 85.0
    if battle.battle_state:
        st = json.loads(battle.battle_state)
        fuel_pct = st.get("fuel_pct", 85.0)

    engine = TacticalAirBattleEngine(
        player_aircraft=aircraft_to_data(player_ac),
        enemy_aircraft=aircraft_to_data(enemy_ac),
        player_loadout=player_loadout,
        enemy_loadout=enemy_loadout,
        contractor_skill=contractor_skill,
        fuel_pct=fuel_pct,
        seed=battle.id * 1000 + (battle.current_phase or 1),
    )

    # Restore state
    if battle.battle_state:
        state = json.loads(battle.battle_state)
        if state.get("engine_version") == 2:
            engine.restore_from_dict(state)

    return engine


def _apply_subsystem_wear(
    battle: Battle,
    damage_taken: float,
    turns_played: int,
    db: Session,
) -> list:
    """Degrade subsystem conditions after a battle. Returns wear report."""
    import random as _rng

    if not battle.player_aircraft_id:
        return []

    # Find the owned aircraft used in this battle
    owned = db.query(OwnedAircraft).filter(
        OwnedAircraft.user_id == battle.user_id,
        OwnedAircraft.aircraft_id == battle.player_aircraft_id,
    ).first()
    if not owned:
        return []

    subsystems = db.query(AircraftSubsystem).filter(
        AircraftSubsystem.owned_aircraft_id == owned.id
    ).all()
    if not subsystems:
        return []

    # Base wear scales with combat intensity
    # Light (0-20% damage taken, <5 turns): 3-8% per subsystem
    # Standard (20-40%, 5-10 turns): 5-12%
    # Heavy (40%+, 10+ turns): 8-18%
    intensity = 0  # 0=light, 1=standard, 2=heavy
    if damage_taken >= 40 or turns_played >= 10:
        intensity = 2
    elif damage_taken >= 20 or turns_played >= 5:
        intensity = 1

    wear_ranges = [
        (3, 8),    # light
        (5, 12),   # standard
        (8, 18),   # heavy
    ]
    wear_min, wear_max = wear_ranges[intensity]

    # Per-slot weighting: subsystems used more in combat degrade faster
    slot_weights = {
        "radar": 1.2,          # always active
        "engine": 1.3,         # fuel burn = engine wear
        "ecm": 0.8,            # only active when deployed
        "countermeasures": 0.7, # expendable, less wear on dispenser
        "computer": 0.9,       # electronics degrade slowly
        "airframe": 1.1 + (damage_taken / 100),  # scales with hits taken
    }

    rng = _rng.Random(battle.id)
    wear_report = []

    for sub in subsystems:
        weight = slot_weights.get(sub.slot_type, 1.0)
        base_wear = rng.uniform(wear_min, wear_max)
        actual_wear = round(base_wear * weight, 1)

        old_condition = sub.condition_pct
        sub.condition_pct = max(0, int(old_condition - actual_wear))

        wear_report.append({
            "slot_type": sub.slot_type,
            "module_name": sub.module.name if sub.module else "Unknown",
            "before": old_condition,
            "after": sub.condition_pct,
            "wear": round(actual_wear, 1),
        })

    # Also degrade overall aircraft condition
    avg_condition = sum(s.condition_pct for s in subsystems) / max(len(subsystems), 1)
    owned.condition = int(avg_condition)

    db.flush()
    return wear_report


def _save_tactical_engine_state(engine: TacticalAirBattleEngine, battle: Battle):
    """Persist tactical engine state to the Battle record."""
    battle.battle_state = json.dumps(engine.to_dict())
    battle.current_phase = engine.turn


def _save_engine_state(engine: AirBattleEngine | NavalBattleEngine, battle: Battle):
    """Persist engine state to the Battle record."""
    state = {
        "current_phase": engine.current_phase,
        "range_km": engine.range_km,
        "player_fuel_pct": getattr(engine, 'player_fuel_pct', 100.0),
        "player_damage_pct": engine.player_damage_pct,
        "enemy_damage_pct": engine.enemy_damage_pct,
        "detection_advantage": getattr(engine, 'detection_advantage', False),
        "situations": getattr(engine, 'situations', []),
    }
    if hasattr(engine, 'player_loadout'):
        state["loadout_remaining"] = [
            {"weapon_id": item.weapon.id, "quantity": item.quantity}
            for item in engine.player_loadout
        ]
    battle.battle_state = json.dumps(state)
    battle.current_phase = engine.current_phase


# ─── Endpoints ───

@router.post("/start")
def start_battle(data: BattleCreate, db: Session = Depends(get_db)):
    """Start a new battle. Returns battle_id and loadout options."""
    user = db.query(User).filter(User.id == 1).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Determine battle type
    if data.aircraft_id:
        battle_type = BattleType.AIR
        player_ac = db.query(Aircraft).filter(Aircraft.id == data.aircraft_id).first()
        if not player_ac:
            raise HTTPException(status_code=404, detail="Aircraft not found")

        # Determine enemy from contract or pick a default
        enemy_aircraft_id = None
        if data.contract_id:
            contract = db.query(ActiveContract).filter(ActiveContract.id == data.contract_id).first()
            if contract:
                mission = db.query(MissionTemplate).filter(MissionTemplate.id == contract.mission_template_id).first()
                if mission and mission.enemy_aircraft_id:
                    enemy_aircraft_id = mission.enemy_aircraft_id

        # Fallback: pick a random enemy
        if not enemy_aircraft_id:
            enemies = db.query(Aircraft).filter(Aircraft.id != data.aircraft_id).all()
            if enemies:
                import random
                enemy_aircraft_id = random.choice(enemies).id
            else:
                raise HTTPException(status_code=400, detail="No enemy aircraft available")

        enemy_ac = db.query(Aircraft).filter(Aircraft.id == enemy_aircraft_id).first()

        battle = Battle(
            user_id=1,
            contract_id=data.contract_id,
            battle_type=BattleType.AIR,
            player_aircraft_id=data.aircraft_id,
            enemy_aircraft_id=enemy_aircraft_id,
            contractor_id=data.contractor_id,
            current_phase=1,
            engine_version=2,
            status=BattleStatus.LOADOUT,
        )
        db.add(battle)
        db.commit()
        db.refresh(battle)

        # Get compatible weapons for loadout screen (only those in inventory)
        compat_ids = json.loads(player_ac.compatible_weapons) if player_ac.compatible_weapons else []
        weapons = []
        for wid in compat_ids:
            if wid:
                w = db.query(Weapon).filter(Weapon.id == wid).first()
                if w:
                    # Check inventory
                    owned = db.query(OwnedWeapon).filter(
                        OwnedWeapon.user_id == 1,
                        OwnedWeapon.weapon_id == w.id,
                    ).first()
                    stock = owned.quantity if owned else 0
                    weapons.append({
                        "id": w.id, "name": w.name, "type": w.weapon_type.value,
                        "image_url": w.image_url,
                        "weight_kg": w.weight_kg, "max_range_km": w.max_range_km,
                        "no_escape_range_km": w.no_escape_range_km,
                        "base_pk": w.base_pk, "guidance": w.guidance,
                        "cost_per_unit": w.cost_per_unit,
                        "stock": stock,
                    })

        return {
            "battle_id": battle.id,
            "battle_type": "air",
            "player_aircraft": {
                "id": player_ac.id, "name": player_ac.name,
                "image_url": player_ac.image_url,
                "max_payload_kg": player_ac.max_payload_kg,
                "hardpoints": player_ac.hardpoints,
                "radar_type": player_ac.radar_type,
                "radar_range_km": player_ac.radar_range_km,
                "rcs_m2": player_ac.rcs_m2,
                "ecm_suite": player_ac.ecm_suite,
                "ecm_rating": player_ac.ecm_rating,
                "internal_fuel_kg": player_ac.internal_fuel_kg,
                "thrust_to_weight_clean": player_ac.thrust_to_weight_clean,
            },
            "enemy_aircraft": {
                "id": enemy_ac.id, "name": enemy_ac.name,
                "image_url": enemy_ac.image_url,
                "origin": enemy_ac.origin, "generation": enemy_ac.generation,
            },
            "available_weapons": weapons,
        }

    elif data.ship_id:
        battle_type = BattleType.NAVAL
        player_ship = db.query(Ship).filter(Ship.id == data.ship_id).first()
        if not player_ship:
            raise HTTPException(status_code=404, detail="Ship not found")

        # Determine enemy
        enemy_ship_id = None
        if data.contract_id:
            contract = db.query(ActiveContract).filter(ActiveContract.id == data.contract_id).first()
            if contract:
                mission = db.query(MissionTemplate).filter(MissionTemplate.id == contract.mission_template_id).first()
                if mission and mission.enemy_ship_id:
                    enemy_ship_id = mission.enemy_ship_id

        if not enemy_ship_id:
            enemies = db.query(Ship).filter(Ship.id != data.ship_id).all()
            if enemies:
                import random
                enemy_ship_id = random.choice(enemies).id
            else:
                raise HTTPException(status_code=400, detail="No enemy ship available")

        enemy_ship = db.query(Ship).filter(Ship.id == enemy_ship_id).first()

        battle = Battle(
            user_id=1,
            contract_id=data.contract_id,
            battle_type=BattleType.NAVAL,
            player_ship_id=data.ship_id,
            enemy_ship_id=enemy_ship_id,
            contractor_id=data.contractor_id,
            current_phase=1,
            status=BattleStatus.LOADOUT,
        )
        db.add(battle)
        db.commit()
        db.refresh(battle)

        return {
            "battle_id": battle.id,
            "battle_type": "naval",
            "player_ship": {
                "id": player_ship.id, "name": player_ship.name,
                "class_name": player_ship.class_name,
                "displacement_tons": player_ship.displacement_tons,
                "radar_type": player_ship.radar_type,
            },
            "enemy_ship": {
                "id": enemy_ship.id, "name": enemy_ship.name,
                "class_name": enemy_ship.class_name, "origin": enemy_ship.origin,
            },
            "available_weapons": [],  # naval loadout is fixed by ship class
        }

    else:
        raise HTTPException(status_code=400, detail="Must provide aircraft_id or ship_id")


@router.post("/{battle_id}/loadout")
def submit_loadout(battle_id: int, data: LoadoutSubmit, db: Session = Depends(get_db)):
    """Submit weapon loadout. Validates weight/hardpoint constraints. Advances to phase 2."""
    battle = db.query(Battle).filter(Battle.id == battle_id).first()
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")
    if battle.status != BattleStatus.LOADOUT:
        raise HTTPException(status_code=400, detail="Battle is not in loadout phase")

    if battle.battle_type == BattleType.AIR:
        player_ac = db.query(Aircraft).filter(Aircraft.id == battle.player_aircraft_id).first()
        if not player_ac:
            raise HTTPException(status_code=404, detail="Aircraft not found")

        # Validate loadout
        total_weight = 0
        total_hardpoints = 0
        for item in data.weapons:
            w = db.query(Weapon).filter(Weapon.id == item["weapon_id"]).first()
            if not w:
                raise HTTPException(status_code=400, detail=f"Weapon {item['weapon_id']} not found")
            total_weight += w.weight_kg * item["quantity"]
            total_hardpoints += item["quantity"]

        if total_weight > player_ac.max_payload_kg:
            raise HTTPException(
                status_code=400,
                detail=f"Loadout too heavy: {total_weight}kg exceeds max {player_ac.max_payload_kg}kg"
            )
        if total_hardpoints > player_ac.hardpoints:
            raise HTTPException(
                status_code=400,
                detail=f"Too many weapons: {total_hardpoints} exceeds {player_ac.hardpoints} hardpoints"
            )

        # Deduct weapons from inventory
        for item in data.weapons:
            owned = db.query(OwnedWeapon).filter(
                OwnedWeapon.user_id == battle.user_id,
                OwnedWeapon.weapon_id == item["weapon_id"],
            ).first()
            if not owned or owned.quantity < item["quantity"]:
                w = db.query(Weapon).filter(Weapon.id == item["weapon_id"]).first()
                wname = w.name if w else f"ID {item['weapon_id']}"
                raise HTTPException(
                    status_code=400,
                    detail=f"Not enough {wname} in inventory"
                )
            owned.quantity -= item["quantity"]
            if owned.quantity == 0:
                db.delete(owned)

    # Save loadout and advance
    battle.player_loadout = json.dumps(data.weapons)
    battle.current_phase = 2
    battle.status = BattleStatus.IN_PROGRESS

    # Store initial fuel_pct for v2
    if battle.battle_type == BattleType.AIR and getattr(battle, 'engine_version', 1) == 2:
        battle.battle_state = json.dumps({"engine_version": 2, "fuel_pct": data.fuel_pct})

    db.commit()

    # Return initial battle state
    if battle.battle_type == BattleType.AIR:
        if getattr(battle, 'engine_version', 1) == 2:
            engine = _build_tactical_air_engine(battle, db)
            state = engine.get_current_state()
            return _tactical_state_to_dict(state)
        engine = _build_air_engine(battle, db)
        state = engine.get_current_state()
    else:
        # Naval — loadout is the ship itself
        player_ship = db.query(Ship).filter(Ship.id == battle.player_ship_id).first()
        enemy_ship = db.query(Ship).filter(Ship.id == battle.enemy_ship_id).first()
        engine = NavalBattleEngine(
            player_ship=ship_to_data(player_ship, db),
            enemy_ship=ship_to_data(enemy_ship, db),
            seed=battle.id,
        )
        state = engine.get_current_state()

    return _state_to_dict(state)


@router.get("/{battle_id}/state")
def get_battle_state(battle_id: int, db: Session = Depends(get_db)):
    """Get current battle state for the tactical display."""
    battle = db.query(Battle).filter(Battle.id == battle_id).first()
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")

    if battle.battle_type == BattleType.AIR and getattr(battle, 'engine_version', 1) == 2:
        engine = _build_tactical_air_engine(battle, db)
        state = engine.get_current_state()
        result = _tactical_state_to_dict(state)
        # Include completed turns
        phases = db.query(BattlePhase).filter(BattlePhase.battle_id == battle_id).order_by(BattlePhase.phase_number).all()
        result["completed_turns"] = [{"turn_number": p.phase_number, "player_choice": p.player_choice, "outcome": json.loads(p.outcome)} for p in phases]
        return result

    if battle.battle_type == BattleType.AIR:
        engine = _build_air_engine(battle, db)
    else:
        player_ship = db.query(Ship).filter(Ship.id == battle.player_ship_id).first()
        enemy_ship = db.query(Ship).filter(Ship.id == battle.enemy_ship_id).first()
        engine = NavalBattleEngine(
            player_ship=ship_to_data(player_ship, db),
            enemy_ship=ship_to_data(enemy_ship, db),
            seed=battle.id,
        )

    state = engine.get_current_state()

    # Also return completed phases
    phases = db.query(BattlePhase).filter(BattlePhase.battle_id == battle_id).order_by(BattlePhase.phase_number).all()
    completed = [{"phase_number": p.phase_number, "phase_name": p.phase_name, "player_choice": p.player_choice, "outcome": json.loads(p.outcome)} for p in phases]

    result = _state_to_dict(state)
    result["completed_phases"] = completed
    return result


@router.post("/{battle_id}/choose")
def submit_choice(battle_id: int, data: BattleChoiceSubmit, db: Session = Depends(get_db)):
    """Submit a player choice for the current phase. Returns phase result."""
    battle = db.query(Battle).filter(Battle.id == battle_id).first()
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")
    if battle.status != BattleStatus.IN_PROGRESS:
        raise HTTPException(status_code=400, detail="Battle is not in progress")

    # ─── Tactical v2 air battle ───
    if battle.battle_type == BattleType.AIR and getattr(battle, 'engine_version', 1) == 2:
        engine = _build_tactical_air_engine(battle, db)

        # Parse weapon_id from action key if not provided separately
        action = data.choice
        weapon_id = None
        if action.startswith("fire_bvr_") or action.startswith("fire_ir_"):
            parts = action.rsplit("_", 1)
            if parts[-1].isdigit():
                weapon_id = int(parts[-1])

        turn_result = engine.run_turn(action, weapon_id)
        _save_tactical_engine_state(engine, battle)

        # Save turn as a phase record for persistence
        phase_record = BattlePhase(
            battle_id=battle_id,
            phase_number=turn_result.turn_number,
            phase_name=f"Turn {turn_result.turn_number}",
            player_choice=action,
            outcome=json.dumps({
                "player_action": turn_result.player_action,
                "enemy_action": turn_result.enemy_action,
                "weapon_fired": turn_result.weapon_fired,
                "shot_pk": turn_result.shot_pk,
                "shot_hit": turn_result.shot_hit,
                "enemy_weapon_fired": turn_result.enemy_weapon_fired,
                "enemy_shot_pk": turn_result.enemy_shot_pk,
                "enemy_shot_hit": turn_result.enemy_shot_hit,
                "damage_dealt": turn_result.damage_dealt,
                "damage_taken": turn_result.damage_taken,
                "range_change": turn_result.range_change,
                "new_range": turn_result.new_range,
                "zone": turn_result.zone,
                "intel_revealed": turn_result.intel_revealed,
                "fuel_consumed": turn_result.fuel_consumed,
                "narrative": turn_result.narrative,
                "factors": turn_result.factors,
            }),
        )
        db.add(phase_record)

        # Check completion
        if engine.status == "completed":
            report = engine.get_battle_result()
            battle.status = BattleStatus.COMPLETED_SUCCESS if report.success else BattleStatus.COMPLETED_FAILURE
            battle.completed_at = datetime.now()
            # Apply subsystem wear
            wear_report = _apply_subsystem_wear(
                battle, report.total_damage_taken, report.turns_played, db,
            )

            # Award research points based on performance
            rp_earned = 10 + int(report.turns_played * 2)  # 10 base + 2 per turn
            if report.success:
                rp_earned = int(rp_earned * 1.5)

            battle.final_result = json.dumps({
                "success": report.success,
                "exit_reason": report.exit_reason,
                "turns_played": report.turns_played,
                "payout": report.payout,
                "reputation_change": report.reputation_change,
                "damage_dealt": report.total_damage_dealt,
                "damage_taken": report.total_damage_taken,
                "fuel_remaining": report.fuel_remaining,
                "narrative": report.narrative_summary,
                "subsystem_wear": wear_report,
                "rp_earned": rp_earned,
            })

            user = db.query(User).filter(User.id == battle.user_id).first()
            if user:
                user.balance += report.payout
                user.reputation = max(0, min(100, user.reputation + report.reputation_change))
                user.research_points = getattr(user, 'research_points', 0) + rp_earned

            if battle.contract_id:
                contract = db.query(ActiveContract).filter(ActiveContract.id == battle.contract_id).first()
                if contract:
                    contract.status = MissionStatus.COMPLETED_SUCCESS if report.success else MissionStatus.COMPLETED_FAILURE
                    contract.payout_received = report.payout
                    contract.reputation_change = report.reputation_change
                    contract.completed_at = datetime.now()
                    mission_log = MissionLog(
                        user_id=battle.user_id,
                        mission_template_id=contract.mission_template_id,
                        status=MissionStatus.COMPLETED_SUCCESS if report.success else MissionStatus.COMPLETED_FAILURE,
                        payout_earned=report.payout,
                        reputation_change=report.reputation_change,
                        enemy_strength=int(report.total_damage_dealt),
                        ally_strength=int(100 - report.total_damage_taken),
                        random_events=json.dumps([]),
                        started_at=contract.started_at or datetime.now(),
                        ended_at=datetime.now(),
                    )
                    db.add(mission_log)

        db.commit()

        # Build v2 response
        response = {
            "engine_version": 2,
            "turn_number": turn_result.turn_number,
            "player_action": turn_result.player_action,
            "enemy_action": turn_result.enemy_action,
            "weapon_fired": turn_result.weapon_fired,
            "shot_pk": turn_result.shot_pk,
            "shot_hit": turn_result.shot_hit,
            "enemy_weapon_fired": turn_result.enemy_weapon_fired,
            "enemy_shot_pk": turn_result.enemy_shot_pk,
            "enemy_shot_hit": turn_result.enemy_shot_hit,
            "damage_dealt": turn_result.damage_dealt,
            "damage_taken": turn_result.damage_taken,
            "range_change": turn_result.range_change,
            "new_range": turn_result.new_range,
            "zone": turn_result.zone,
            "intel_revealed": turn_result.intel_revealed,
            "fuel_consumed": turn_result.fuel_consumed,
            "narrative": turn_result.narrative,
            "factors": turn_result.factors,
            "next_actions": [
                {"key": a.key, "label": a.label, "description": a.description,
                 "risk_hint": a.risk_hint, "weapon_id": a.weapon_id, "pk_preview": a.pk_preview}
                for a in turn_result.next_actions
            ],
        }

        # Updated state
        current_state = engine.get_current_state()
        response["state"] = _tactical_state_to_dict(current_state)

        if battle.status in (BattleStatus.COMPLETED_SUCCESS, BattleStatus.COMPLETED_FAILURE):
            final = json.loads(battle.final_result) if battle.final_result else {}
            response["battle_complete"] = True
            response["final_report"] = final
        else:
            response["battle_complete"] = False

        return response

    # ─── Legacy v1 air battle ───
    if battle.battle_type == BattleType.AIR:
        engine = _build_air_engine(battle, db)
        phase_result = engine.run_phase(data.choice)
        _save_engine_state(engine, battle)

        # Check if battle is complete (phase 6 done)
        if engine.current_phase > 6:
            report = engine.get_battle_result()
            battle.status = BattleStatus.COMPLETED_SUCCESS if report.success else BattleStatus.COMPLETED_FAILURE
            battle.completed_at = datetime.now()
            # Apply subsystem wear (v1 — 5 phases is standard intensity)
            wear_report = _apply_subsystem_wear(
                battle, report.total_damage_taken, 5, db,
            )

            # Award research points (v1 uses 5 turns)
            rp_earned_v1 = 10 + int(5 * 2)  # 10 base + 2 per turn
            if report.success:
                rp_earned_v1 = int(rp_earned_v1 * 1.5)

            battle.final_result = json.dumps({
                "success": report.success,
                "payout": report.payout,
                "reputation_change": report.reputation_change,
                "damage_dealt": report.total_damage_dealt,
                "damage_taken": report.total_damage_taken,
                "narrative": report.narrative_summary,
                "subsystem_wear": wear_report,
                "rp_earned": rp_earned_v1,
            })

            # Apply rewards to user
            user = db.query(User).filter(User.id == battle.user_id).first()
            if user:
                user.balance += report.payout
                user.reputation = max(0, min(100, user.reputation + report.reputation_change))
                user.research_points = getattr(user, 'research_points', 0) + rp_earned_v1

            # Update contract if linked
            if battle.contract_id:
                contract = db.query(ActiveContract).filter(ActiveContract.id == battle.contract_id).first()
                if contract:
                    contract.status = MissionStatus.COMPLETED_SUCCESS if report.success else MissionStatus.COMPLETED_FAILURE
                    contract.payout_received = report.payout
                    contract.reputation_change = report.reputation_change
                    contract.completed_at = datetime.now()

                    # Create mission log
                    mission_log = MissionLog(
                        user_id=battle.user_id,
                        mission_template_id=contract.mission_template_id,
                        status=MissionStatus.COMPLETED_SUCCESS if report.success else MissionStatus.COMPLETED_FAILURE,
                        payout_earned=report.payout,
                        reputation_change=report.reputation_change,
                        enemy_strength=int(report.total_damage_dealt),
                        ally_strength=int(100 - report.total_damage_taken),
                        random_events=json.dumps([]),
                        started_at=contract.started_at or datetime.now(),
                        ended_at=datetime.now(),
                    )
                    db.add(mission_log)

    else:
        # Naval battle
        player_ship = db.query(Ship).filter(Ship.id == battle.player_ship_id).first()
        enemy_ship = db.query(Ship).filter(Ship.id == battle.enemy_ship_id).first()
        engine = NavalBattleEngine(
            player_ship=ship_to_data(player_ship, db),
            enemy_ship=ship_to_data(enemy_ship, db),
            seed=battle.id * 1000 + battle.current_phase,
        )
        # Restore state
        if battle.battle_state:
            st = json.loads(battle.battle_state)
            engine.current_phase = st.get("current_phase", 2)
            engine.player_damage_pct = st.get("player_damage_pct", 0.0)
            engine.enemy_damage_pct = st.get("enemy_damage_pct", 0.0)
            engine.range_km = st.get("range_km", 350.0)
            engine.detection_advantage = st.get("detection_advantage", False)

        phase_result = engine.run_phase(data.choice)
        _save_engine_state(engine, battle)

        if engine.current_phase > 6:
            report = engine.get_battle_result()
            battle.status = BattleStatus.COMPLETED_SUCCESS if report.success else BattleStatus.COMPLETED_FAILURE
            battle.completed_at = datetime.now()
            # Award research points (naval, 5 turns)
            rp_earned_naval = 10 + int(5 * 2)
            if report.success:
                rp_earned_naval = int(rp_earned_naval * 1.5)

            battle.final_result = json.dumps({
                "success": report.success,
                "payout": report.payout,
                "reputation_change": report.reputation_change,
                "damage_dealt": report.total_damage_dealt,
                "damage_taken": report.total_damage_taken,
                "narrative": report.narrative_summary,
                "rp_earned": rp_earned_naval,
            })
            user = db.query(User).filter(User.id == battle.user_id).first()
            if user:
                user.balance += report.payout
                user.reputation = max(0, min(100, user.reputation + report.reputation_change))
                user.research_points = getattr(user, 'research_points', 0) + rp_earned_naval

    # Save phase to DB
    phase_record = BattlePhase(
        battle_id=battle_id,
        phase_number=phase_result.phase_number,
        phase_name=phase_result.phase_name,
        player_choice=phase_result.player_choice,
        outcome=json.dumps({
            "choice_quality": phase_result.choice_quality,
            "factors": phase_result.factors,
            "outcome": phase_result.outcome,
            "narrative": phase_result.narrative,
        }),
    )
    db.add(phase_record)
    db.commit()

    # Build response
    response = {
        "phase_number": phase_result.phase_number,
        "phase_name": phase_result.phase_name,
        "player_choice": phase_result.player_choice,
        "choice_quality": phase_result.choice_quality,
        "factors": phase_result.factors,
        "outcome": phase_result.outcome,
        "narrative": phase_result.narrative,
        "next_choices": [
            {"key": c.key, "label": c.label, "description": c.description, "risk_hint": c.risk_hint}
            for c in phase_result.next_choices
        ],
    }

    # If battle complete, include final report
    if battle.status in (BattleStatus.COMPLETED_SUCCESS, BattleStatus.COMPLETED_FAILURE):
        final = json.loads(battle.final_result) if battle.final_result else {}
        response["battle_complete"] = True
        response["final_report"] = final
    else:
        response["battle_complete"] = False

    return response


@router.get("/{battle_id}/report")
def get_battle_report(battle_id: int, db: Session = Depends(get_db)):
    """Get the full after-action report for a completed battle."""
    battle = db.query(Battle).filter(Battle.id == battle_id).first()
    if not battle:
        raise HTTPException(status_code=404, detail="Battle not found")

    if battle.status not in (BattleStatus.COMPLETED_SUCCESS, BattleStatus.COMPLETED_FAILURE):
        raise HTTPException(status_code=400, detail="Battle is not yet complete")

    phases = db.query(BattlePhase).filter(BattlePhase.battle_id == battle_id).order_by(BattlePhase.phase_number).all()
    phase_list = []
    for p in phases:
        outcome_data = json.loads(p.outcome)
        phase_list.append({
            "phase_number": p.phase_number,
            "phase_name": p.phase_name,
            "player_choice": p.player_choice,
            "choice_quality": outcome_data.get("choice_quality", "neutral"),
            "factors": outcome_data.get("factors", []),
            "outcome": outcome_data.get("outcome", {}),
            "narrative": outcome_data.get("narrative", ""),
        })

    final = json.loads(battle.final_result) if battle.final_result else {}

    # Get aircraft/ship names
    player_name = ""
    enemy_name = ""
    if battle.battle_type == BattleType.AIR:
        pa = db.query(Aircraft).filter(Aircraft.id == battle.player_aircraft_id).first()
        ea = db.query(Aircraft).filter(Aircraft.id == battle.enemy_aircraft_id).first()
        player_name = pa.name if pa else "Unknown"
        enemy_name = ea.name if ea else "Unknown"
    else:
        ps = db.query(Ship).filter(Ship.id == battle.player_ship_id).first()
        es = db.query(Ship).filter(Ship.id == battle.enemy_ship_id).first()
        player_name = ps.name if ps else "Unknown"
        enemy_name = es.name if es else "Unknown"

    report = {
        "battle_id": battle.id,
        "battle_type": battle.battle_type.value,
        "engine_version": getattr(battle, 'engine_version', 1),
        "player_name": player_name,
        "enemy_name": enemy_name,
        "success": final.get("success", False),
        "payout": final.get("payout", 0),
        "reputation_change": final.get("reputation_change", 0),
        "damage_dealt": final.get("damage_dealt", 0),
        "damage_taken": final.get("damage_taken", 0),
        "narrative_summary": final.get("narrative", ""),
        "phases": phase_list,
    }

    # v2 extras
    if getattr(battle, 'engine_version', 1) == 2:
        report["exit_reason"] = final.get("exit_reason", "")
        report["turns_played"] = final.get("turns_played", len(phase_list))
        report["fuel_remaining"] = final.get("fuel_remaining", 0)

    # Include subsystem wear report if available
    report["subsystem_wear"] = final.get("subsystem_wear", [])

    return report


def _state_to_dict(state) -> dict:
    """Convert BattleState dataclass to a JSON-serializable dict."""
    return {
        "phase": state.phase,
        "phase_name": state.phase_name,
        "player_name": state.player_name,
        "enemy_name": state.enemy_name,
        "range_km": state.range_km,
        "player_ammo": state.player_ammo,
        "player_fuel_pct": state.player_fuel_pct,
        "player_damage_pct": state.player_damage_pct,
        "enemy_damage_pct": state.enemy_damage_pct,
        "available_choices": [
            {"key": c.key, "label": c.label, "description": c.description, "risk_hint": c.risk_hint}
            for c in state.available_choices
        ],
        "status": state.status,
    }


def _tactical_state_to_dict(state) -> dict:
    """Convert TacticalBattleState to a JSON-serializable dict."""
    return {
        "engine_version": 2,
        "turn": state.turn,
        "max_turns": state.max_turns,
        "range_km": state.range_km,
        "zone": state.zone,
        "player_name": state.player_name,
        "enemy_intel": state.enemy_intel,
        "player_ammo": state.player_ammo,
        "fuel_pct": state.fuel_pct,
        "damage_pct": state.damage_pct,
        "ecm_charges": state.ecm_charges,
        "flare_uses": state.flare_uses,
        "available_actions": [
            {"key": a.key, "label": a.label, "description": a.description,
             "risk_hint": a.risk_hint, "weapon_id": a.weapon_id, "pk_preview": a.pk_preview}
            for a in state.available_actions
        ],
        "status": state.status,
        "exit_reason": state.exit_reason,
    }
