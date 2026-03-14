from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.ship import Ship as ShipModel
from app.schemas.ship import Ship as ShipSchema

router = APIRouter(prefix="/ships", tags=["ships"])


@router.get("/", response_model=List[ShipSchema])
def list_ships(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(ShipModel).filter(ShipModel.is_active == True).offset(skip).limit(limit).all()


@router.get("/{ship_id}", response_model=ShipSchema)
def get_ship(ship_id: int, db: Session = Depends(get_db)):
    ship = db.query(ShipModel).filter(ShipModel.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")
    return ship
