import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional, List

from app.db.session import get_db
from app.models.subsystem import SubsystemModule, AircraftSubsystem
from app.models.owned_aircraft import OwnedAircraft
from app.models.aircraft import Aircraft
from app.models.user import User

router = APIRouter(prefix="/subsystems", tags=["subsystems"])

SLOT_TYPES = {"radar", "engine", "ecm", "countermeasures", "computer", "airframe"}


# ---------- Pydantic request bodies ----------

class SwapRequest(BaseModel):
    slot_type: str
    new_module_id: int


class RepairRequest(BaseModel):
    slot_type: Optional[str] = None
    repair_all: bool = False


# ---------- Helpers ----------

def _module_to_dict(mod: SubsystemModule) -> dict:
    return {
        "id": mod.id,
        "name": mod.name,
        "slot_type": mod.slot_type,
        "tier": mod.tier,
        "origin": mod.origin,
        "description": mod.description,
        "stats": json.loads(mod.stats),
        "cost": mod.cost,
        "maintenance_cost": mod.maintenance_cost,
        "compatible_aircraft": json.loads(mod.compatible_aircraft) if mod.compatible_aircraft else None,
        "is_default": mod.is_default,
    }


def _subsystem_to_dict(sub: AircraftSubsystem) -> dict:
    mod = sub.module
    return {
        "id": sub.id,
        "slot_type": sub.slot_type,
        "module": _module_to_dict(mod),
        "condition_pct": sub.condition_pct,
        "installed_at": sub.installed_at.isoformat() if sub.installed_at else None,
    }


def _get_owned_aircraft_or_404(db: Session, owned_aircraft_id: int) -> OwnedAircraft:
    owned = db.query(OwnedAircraft).filter(OwnedAircraft.id == owned_aircraft_id).first()
    if not owned:
        raise HTTPException(status_code=404, detail="Owned aircraft not found")
    return owned


# ---------- Endpoints ----------

@router.get("/modules")
def list_modules(slot_type: Optional[str] = None, db: Session = Depends(get_db)):
    """List all available subsystem modules, optionally filtered by slot type."""
    query = db.query(SubsystemModule)
    if slot_type:
        if slot_type not in SLOT_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid slot_type. Must be one of: {', '.join(sorted(SLOT_TYPES))}")
        query = query.filter(SubsystemModule.slot_type == slot_type)
    modules = query.all()
    return [_module_to_dict(m) for m in modules]


@router.get("/aircraft/{owned_aircraft_id}")
def get_aircraft_subsystems(owned_aircraft_id: int, db: Session = Depends(get_db)):
    """Get all 6 subsystem slots for an aircraft with current modules."""
    owned = _get_owned_aircraft_or_404(db, owned_aircraft_id)
    subs = (
        db.query(AircraftSubsystem)
        .filter(AircraftSubsystem.owned_aircraft_id == owned_aircraft_id)
        .all()
    )
    aircraft = db.query(Aircraft).filter(Aircraft.id == owned.aircraft_id).first()
    return {
        "owned_aircraft_id": owned_aircraft_id,
        "aircraft_name": aircraft.name if aircraft else "Unknown",
        "subsystems": [_subsystem_to_dict(s) for s in subs],
    }


@router.post("/aircraft/{owned_aircraft_id}/swap")
def swap_module(owned_aircraft_id: int, body: SwapRequest, db: Session = Depends(get_db)):
    """Swap a subsystem module on an aircraft."""
    owned = _get_owned_aircraft_or_404(db, owned_aircraft_id)

    if body.slot_type not in SLOT_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid slot_type. Must be one of: {', '.join(sorted(SLOT_TYPES))}")

    # Validate the new module exists
    new_module = db.query(SubsystemModule).filter(SubsystemModule.id == body.new_module_id).first()
    if not new_module:
        raise HTTPException(status_code=404, detail="Module not found")

    if new_module.slot_type != body.slot_type:
        raise HTTPException(status_code=400, detail=f"Module slot_type '{new_module.slot_type}' does not match requested slot '{body.slot_type}'")

    # Check compatibility
    if new_module.compatible_aircraft:
        compatible_ids = json.loads(new_module.compatible_aircraft)
        if owned.aircraft_id not in compatible_ids:
            raise HTTPException(status_code=400, detail="Module is not compatible with this aircraft")

    # If this module is installed on another aircraft, uninstall it first
    existing_install = (
        db.query(AircraftSubsystem)
        .filter(
            AircraftSubsystem.module_id == body.new_module_id,
            AircraftSubsystem.owned_aircraft_id != owned_aircraft_id,
        )
        .first()
    )
    if existing_install:
        # Find the default module for that aircraft+slot to swap back
        other_owned = db.query(OwnedAircraft).filter(OwnedAircraft.id == existing_install.owned_aircraft_id).first()
        if other_owned:
            other_aircraft = db.query(Aircraft).filter(Aircraft.id == other_owned.aircraft_id).first()
            if other_aircraft:
                default_mod = (
                    db.query(SubsystemModule)
                    .filter(
                        SubsystemModule.slot_type == body.slot_type,
                        SubsystemModule.is_default == True,
                        SubsystemModule.name.contains(other_aircraft.name),
                    )
                    .first()
                )
                if default_mod:
                    existing_install.module_id = default_mod.id
                else:
                    # No default found — just remove the install
                    db.delete(existing_install)

    # Find the current subsystem record for this aircraft+slot
    current_sub = (
        db.query(AircraftSubsystem)
        .filter(
            AircraftSubsystem.owned_aircraft_id == owned_aircraft_id,
            AircraftSubsystem.slot_type == body.slot_type,
        )
        .first()
    )

    if current_sub:
        current_sub.module_id = new_module.id
        # Keep the module's condition
    else:
        current_sub = AircraftSubsystem(
            owned_aircraft_id=owned_aircraft_id,
            slot_type=body.slot_type,
            module_id=new_module.id,
            condition_pct=100,
        )
        db.add(current_sub)

    db.commit()
    db.refresh(current_sub)

    return _subsystem_to_dict(current_sub)


@router.post("/aircraft/{owned_aircraft_id}/repair")
def repair_subsystems(owned_aircraft_id: int, body: RepairRequest, db: Session = Depends(get_db)):
    """Repair subsystem modules. Cost based on damage and module maintenance_cost."""
    owned = _get_owned_aircraft_or_404(db, owned_aircraft_id)

    user = db.query(User).filter(User.id == 1).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    query = db.query(AircraftSubsystem).filter(
        AircraftSubsystem.owned_aircraft_id == owned_aircraft_id
    )

    if body.slot_type and not body.repair_all:
        if body.slot_type not in SLOT_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid slot_type.")
        query = query.filter(AircraftSubsystem.slot_type == body.slot_type)

    subs_to_repair = query.all()

    total_cost = 0
    repairs = []

    for sub in subs_to_repair:
        if sub.condition_pct >= 100:
            continue
        damage_pct = 100 - sub.condition_pct
        module = sub.module
        # Cost = (damage% / 100) * maintenance_cost
        cost = int((damage_pct / 100.0) * module.maintenance_cost)
        total_cost += cost
        repairs.append((sub, cost))

    if total_cost == 0:
        return {
            "message": "Nothing to repair — all subsystems at 100%.",
            "total_cost": 0,
            "new_balance": user.balance,
            "subsystems": [_subsystem_to_dict(s) for s in subs_to_repair],
        }

    if user.balance < total_cost:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. Repair costs {total_cost}, you have {user.balance}.",
        )

    user.balance -= total_cost
    for sub, _ in repairs:
        sub.condition_pct = 100

    db.commit()

    # Re-query to return fresh data
    updated_subs = (
        db.query(AircraftSubsystem)
        .filter(AircraftSubsystem.owned_aircraft_id == owned_aircraft_id)
        .all()
    )

    return {
        "message": f"Repaired {len(repairs)} subsystem(s).",
        "total_cost": total_cost,
        "new_balance": user.balance,
        "subsystems": [_subsystem_to_dict(s) for s in updated_subs],
    }


@router.get("/aircraft/{owned_aircraft_id}/stats")
def get_computed_stats(owned_aircraft_id: int, db: Session = Depends(get_db)):
    """Get computed aircraft stats by combining all installed module effects."""
    owned = _get_owned_aircraft_or_404(db, owned_aircraft_id)
    aircraft = db.query(Aircraft).filter(Aircraft.id == owned.aircraft_id).first()

    subs = (
        db.query(AircraftSubsystem)
        .filter(AircraftSubsystem.owned_aircraft_id == owned_aircraft_id)
        .all()
    )

    # Build computed stats from modules
    computed = {
        "aircraft_name": aircraft.name if aircraft else "Unknown",
        "owned_aircraft_id": owned_aircraft_id,
        # Radar
        "radar_type": None,
        "radar_range_km": 0,
        "irst": False,
        # Engine
        "thrust_to_weight_mod": 1.0,
        "fuel_efficiency_mod": 1.0,
        "max_speed_mod": 1.0,
        # ECM
        "ecm_suite": None,
        "ecm_rating": 0,
        # Countermeasures
        "chaff_count": 0,
        "flare_count": 0,
        "towed_decoy": False,
        # Computer
        "pk_bonus": 0.0,
        "scan_speed_mod": 1.0,
        "multi_target": 2,
        # Airframe
        "max_g_mod": 9.0,
        "rcs_mod": 1.0,
        "payload_mod": 1.0,
        "hp_mod": 1.0,
    }

    for sub in subs:
        stats = json.loads(sub.module.stats)
        # Apply condition degradation — stats scale linearly with condition
        condition_factor = sub.condition_pct / 100.0

        if sub.slot_type == "radar":
            computed["radar_type"] = stats.get("radar_type")
            computed["radar_range_km"] = int(stats.get("radar_range_km", 0) * condition_factor)
            computed["irst"] = stats.get("irst", False)
        elif sub.slot_type == "engine":
            # Interpolate toward 1.0 (neutral) based on damage
            computed["thrust_to_weight_mod"] = 1.0 + (stats.get("thrust_to_weight_mod", 1.0) - 1.0) * condition_factor
            computed["fuel_efficiency_mod"] = 1.0 + (stats.get("fuel_efficiency_mod", 1.0) - 1.0) * condition_factor
            computed["max_speed_mod"] = 1.0 + (stats.get("max_speed_mod", 1.0) - 1.0) * condition_factor
        elif sub.slot_type == "ecm":
            computed["ecm_suite"] = stats.get("ecm_suite")
            computed["ecm_rating"] = int(stats.get("ecm_rating", 0) * condition_factor)
        elif sub.slot_type == "countermeasures":
            computed["chaff_count"] = int(stats.get("chaff_count", 0) * condition_factor)
            computed["flare_count"] = int(stats.get("flare_count", 0) * condition_factor)
            computed["towed_decoy"] = stats.get("towed_decoy", False)
        elif sub.slot_type == "computer":
            computed["pk_bonus"] = round(stats.get("pk_bonus", 0.0) * condition_factor, 3)
            computed["scan_speed_mod"] = 1.0 + (stats.get("scan_speed_mod", 1.0) - 1.0) * condition_factor
            computed["multi_target"] = stats.get("multi_target", 2)
        elif sub.slot_type == "airframe":
            computed["max_g_mod"] = stats.get("max_g_mod", 9.0)
            computed["rcs_mod"] = stats.get("rcs_mod", 1.0)
            computed["payload_mod"] = 1.0 + (stats.get("payload_mod", 1.0) - 1.0) * condition_factor
            computed["hp_mod"] = stats.get("hp_mod", 1.0) * condition_factor

    return computed
