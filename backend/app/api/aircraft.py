from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.aircraft import Aircraft as AircraftModel
from app.models.owned_aircraft import OwnedAircraft as OwnedAircraftModel
from app.schemas.aircraft import Aircraft as AircraftSchema

router = APIRouter(prefix="/aircraft", tags=["aircraft"])


@router.get("/", response_model=List[AircraftSchema])
def list_aircraft(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(AircraftModel).filter(AircraftModel.is_active == True).offset(skip).limit(limit).all()


@router.get("/{aircraft_id}", response_model=AircraftSchema)
def get_aircraft(aircraft_id: int, db: Session = Depends(get_db)):
    aircraft = db.query(AircraftModel).filter(AircraftModel.id == aircraft_id).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")
    return aircraft


# Owned aircraft endpoints
@router.get("/owned/list")
def list_owned_aircraft(db: Session = Depends(get_db)):
    owned = db.query(OwnedAircraftModel).all()
    result = []
    for o in owned:
        ac = db.query(AircraftModel).filter(AircraftModel.id == o.aircraft_id).first()
        result.append({
            "id": o.id,
            "aircraft_id": o.aircraft_id,
            "name": ac.name if ac else "Unknown",
            "origin": ac.origin if ac else "",
            "role": ac.role if ac else "",
            "condition": o.condition,
            "unlock_cost": ac.unlock_cost if ac else 0,
            "maintenance_cost": ac.maintenance_cost if ac else 0,
            "acquired_at": o.acquired_at,
        })
    return result


@router.post("/owned/purchase")
def purchase_aircraft(aircraft_id: int, db: Session = Depends(get_db)):
    """Purchase an aircraft — deducts cost from user balance."""
    from app.models.user import User
    user = db.query(User).filter(User.id == 1).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    aircraft = db.query(AircraftModel).filter(AircraftModel.id == aircraft_id).first()
    if not aircraft:
        raise HTTPException(status_code=404, detail="Aircraft not found")

    if user.balance < aircraft.unlock_cost:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    user.balance -= aircraft.unlock_cost
    owned = OwnedAircraftModel(user_id=1, aircraft_id=aircraft_id, condition=100)
    db.add(owned)
    db.commit()
    db.refresh(owned)

    return {
        "id": owned.id,
        "aircraft_id": aircraft_id,
        "name": aircraft.name,
        "condition": 100,
        "new_balance": user.balance,
    }


@router.delete("/owned/{owned_id}", status_code=status.HTTP_204_NO_CONTENT)
def sell_aircraft(owned_id: int, db: Session = Depends(get_db)):
    owned = db.query(OwnedAircraftModel).filter(OwnedAircraftModel.id == owned_id).first()
    if not owned:
        raise HTTPException(status_code=404, detail="Owned aircraft not found")
    db.delete(owned)
    db.commit()
    return None
