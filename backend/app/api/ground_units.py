"""Ground units API — catalog, purchase, owned units, repair."""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from app.db.session import get_db
from app.models.ground_unit import GroundUnit, OwnedGroundUnit
from app.models.user import User

router = APIRouter(prefix="/ground-units", tags=["ground-units"])


def _unit_to_dict(u: GroundUnit) -> dict:
    return {
        "id": u.id, "name": u.name, "unit_type": u.unit_type, "role": u.role,
        "description": u.description, "origin": u.origin, "image_url": u.image_url,
        "combat_power": u.combat_power, "anti_armor": u.anti_armor,
        "anti_infantry": u.anti_infantry, "anti_air": u.anti_air,
        "survivability": u.survivability, "mobility": u.mobility,
        "cost_usd": u.cost_usd, "upkeep_per_mission": u.upkeep_per_mission,
    }


def _owned_to_dict(o: OwnedGroundUnit) -> dict:
    return {
        "id": o.id, "ground_unit_id": o.ground_unit_id,
        "custom_name": o.custom_name or o.unit.name,
        "hp_pct": o.hp_pct, "battles_fought": o.battles_fought, "kills": o.kills,
        "unit": _unit_to_dict(o.unit),
        "acquired_at": o.acquired_at.isoformat() if o.acquired_at else None,
    }


@router.get("/catalog")
def get_catalog(db: Session = Depends(get_db)):
    """All purchasable ground unit templates."""
    units = db.query(GroundUnit).filter(GroundUnit.is_active == True).order_by(GroundUnit.cost_usd).all()
    return [_unit_to_dict(u) for u in units]


@router.get("/owned")
def get_owned(db: Session = Depends(get_db)):
    """Player's owned ground units."""
    owned = db.query(OwnedGroundUnit).filter(OwnedGroundUnit.user_id == 1).all()
    return [_owned_to_dict(o) for o in owned]


class PurchaseRequest(BaseModel):
    ground_unit_id: int
    custom_name: Optional[str] = None


@router.post("/purchase")
def purchase_unit(data: PurchaseRequest, db: Session = Depends(get_db)):
    """Buy a ground unit from the catalog."""
    user = db.query(User).filter(User.id == 1).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    template = db.query(GroundUnit).filter(GroundUnit.id == data.ground_unit_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Unit not found")

    if user.balance < template.cost_usd:
        raise HTTPException(status_code=400, detail=f"Insufficient funds. Need ${template.cost_usd:,}")

    user.balance -= template.cost_usd
    owned = OwnedGroundUnit(
        user_id=1, ground_unit_id=template.id,
        custom_name=data.custom_name, hp_pct=100.0,
    )
    db.add(owned)
    db.commit()
    db.refresh(owned)
    return {"message": f"{template.name} purchased.", "unit": _owned_to_dict(owned), "new_balance": user.balance}


class RepairRequest(BaseModel):
    owned_unit_id: int


@router.post("/repair")
def repair_unit(data: RepairRequest, db: Session = Depends(get_db)):
    """Repair an owned ground unit. Cost = (100 - hp_pct) / 100 * cost_usd * 0.3."""
    user = db.query(User).filter(User.id == 1).first()
    owned = db.query(OwnedGroundUnit).filter(
        OwnedGroundUnit.id == data.owned_unit_id, OwnedGroundUnit.user_id == 1
    ).first()
    if not owned:
        raise HTTPException(status_code=404, detail="Unit not found")

    damage = 100.0 - owned.hp_pct
    if damage <= 0:
        return {"message": "Unit is already at full health.", "cost": 0}

    repair_cost = int((damage / 100.0) * owned.unit.cost_usd * 0.3)
    if user.balance < repair_cost:
        raise HTTPException(status_code=400, detail=f"Insufficient funds. Repair costs ${repair_cost:,}")

    user.balance -= repair_cost
    owned.hp_pct = 100.0
    db.commit()
    return {"message": f"{owned.custom_name or owned.unit.name} repaired.", "cost": repair_cost, "new_balance": user.balance}


@router.delete("/{owned_unit_id}")
def sell_unit(owned_unit_id: int, db: Session = Depends(get_db)):
    """Sell an owned ground unit for 30% of purchase price."""
    user = db.query(User).filter(User.id == 1).first()
    owned = db.query(OwnedGroundUnit).filter(
        OwnedGroundUnit.id == owned_unit_id, OwnedGroundUnit.user_id == 1
    ).first()
    if not owned:
        raise HTTPException(status_code=404, detail="Unit not found")

    sale_price = int(owned.unit.cost_usd * 0.30 * (owned.hp_pct / 100.0))
    user.balance += sale_price
    db.delete(owned)
    db.commit()
    return {"message": f"Sold for ${sale_price:,}", "new_balance": user.balance}
