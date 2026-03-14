from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel

from app.db.session import get_db
from app.models.weapon import Weapon as WeaponModel, WeaponType
from app.models.owned_weapon import OwnedWeapon as OwnedWeaponModel
from app.models.user import User
from app.schemas.weapon import Weapon as WeaponSchema

router = APIRouter(prefix="/weapons", tags=["weapons"])


@router.get("/", response_model=List[WeaponSchema])
def list_weapons(
    weapon_type: Optional[WeaponType] = Query(None, alias="type"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    query = db.query(WeaponModel).filter(WeaponModel.is_active == True)
    if weapon_type:
        query = query.filter(WeaponModel.weapon_type == weapon_type)
    return query.offset(skip).limit(limit).all()


@router.get("/{weapon_id}", response_model=WeaponSchema)
def get_weapon(weapon_id: int, db: Session = Depends(get_db)):
    weapon = db.query(WeaponModel).filter(WeaponModel.id == weapon_id).first()
    if not weapon:
        raise HTTPException(status_code=404, detail="Weapon not found")
    return weapon


# ── Owned weapon inventory ──

@router.get("/owned/list")
def list_owned_weapons(db: Session = Depends(get_db)):
    owned = db.query(OwnedWeaponModel).filter(OwnedWeaponModel.user_id == 1).all()
    result = []
    for o in owned:
        w = db.query(WeaponModel).filter(WeaponModel.id == o.weapon_id).first()
        if w:
            result.append({
                "id": o.id,
                "weapon_id": o.weapon_id,
                "name": w.name,
                "origin": w.origin,
                "weapon_type": w.weapon_type.value,
                "image_url": w.image_url,
                "quantity": o.quantity,
                "cost_per_unit": w.cost_per_unit,
                "weight_kg": w.weight_kg,
                "max_range_km": w.max_range_km,
                "base_pk": w.base_pk,
                "guidance": w.guidance,
            })
    return result


class WeaponPurchase(BaseModel):
    weapon_id: int
    quantity: int = 1


@router.post("/owned/purchase")
def purchase_weapons(data: WeaponPurchase, db: Session = Depends(get_db)):
    """Purchase weapons — deducts cost from user balance."""
    user = db.query(User).filter(User.id == 1).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    weapon = db.query(WeaponModel).filter(WeaponModel.id == data.weapon_id).first()
    if not weapon:
        raise HTTPException(status_code=404, detail="Weapon not found")

    total_cost = weapon.cost_per_unit * data.quantity
    if user.balance < total_cost:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    user.balance -= total_cost

    # Add to existing stock or create new entry
    existing = db.query(OwnedWeaponModel).filter(
        OwnedWeaponModel.user_id == 1,
        OwnedWeaponModel.weapon_id == data.weapon_id,
    ).first()

    if existing:
        existing.quantity += data.quantity
    else:
        existing = OwnedWeaponModel(
            user_id=1,
            weapon_id=data.weapon_id,
            quantity=data.quantity,
        )
        db.add(existing)

    db.commit()
    db.refresh(existing)

    return {
        "id": existing.id,
        "weapon_id": data.weapon_id,
        "name": weapon.name,
        "quantity": existing.quantity,
        "total_cost": total_cost,
        "new_balance": user.balance,
    }


@router.post("/owned/sell")
def sell_weapons(data: WeaponPurchase, db: Session = Depends(get_db)):
    """Sell weapons back at 50% value."""
    user = db.query(User).filter(User.id == 1).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    existing = db.query(OwnedWeaponModel).filter(
        OwnedWeaponModel.user_id == 1,
        OwnedWeaponModel.weapon_id == data.weapon_id,
    ).first()
    if not existing or existing.quantity < data.quantity:
        raise HTTPException(status_code=400, detail="Not enough weapons to sell")

    weapon = db.query(WeaponModel).filter(WeaponModel.id == data.weapon_id).first()
    refund = (weapon.cost_per_unit * data.quantity) // 2

    existing.quantity -= data.quantity
    if existing.quantity == 0:
        db.delete(existing)
    user.balance += refund

    db.commit()

    return {
        "weapon_id": data.weapon_id,
        "quantity_sold": data.quantity,
        "refund": refund,
        "new_balance": user.balance,
    }
