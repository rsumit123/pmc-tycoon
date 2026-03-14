from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.aircraft import Aircraft as AircraftModel
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
