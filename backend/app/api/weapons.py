from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from app.db.session import get_db
from app.models.weapon import Weapon as WeaponModel, WeaponType
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
