from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.unit import OwnedUnit as OwnedUnitModel, BaseUnitTemplate as BaseUnitTemplateModel
from app.schemas.unit import OwnedUnitCreate, OwnedUnitUpdate, OwnedUnit as OwnedUnitSchema, BaseUnitTemplateCreate, BaseUnitTemplate as BaseUnitTemplateSchema

router = APIRouter(prefix="/units", tags=["units"])

# Base Unit Templates
@router.get("/templates", response_model=List[BaseUnitTemplateSchema])
def read_unit_templates(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    templates = db.query(BaseUnitTemplateModel).offset(skip).limit(limit).all()
    return templates

@router.post("/templates", response_model=BaseUnitTemplateSchema)
def create_unit_template(template: BaseUnitTemplateCreate, db: Session = Depends(get_db)):
    db_template = BaseUnitTemplateModel(**template.dict())
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template

# Owned Units
@router.get("/owned", response_model=List[OwnedUnitSchema])
def read_owned_units(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    units = db.query(OwnedUnitModel).offset(skip).limit(limit).all()
    return units

@router.post("/owned", response_model=OwnedUnitSchema)
def create_owned_unit(unit: OwnedUnitCreate, db: Session = Depends(get_db)):
    db_unit = OwnedUnitModel(**unit.dict())
    db.add(db_unit)
    db.commit()
    db.refresh(db_unit)
    return db_unit

@router.get("/owned/{unit_id}", response_model=OwnedUnitSchema)
def read_owned_unit(unit_id: int, db: Session = Depends(get_db)):
    unit = db.query(OwnedUnitModel).filter_by(id=unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    return unit

@router.put("/owned/{unit_id}", response_model=OwnedUnitSchema)
def update_owned_unit(unit_id: int, unit: OwnedUnitUpdate, db: Session = Depends(get_db)):
    db_unit = db.query(OwnedUnitModel).filter_by(id=unit_id).first()
    if not db_unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    update_data = unit.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_unit, key, value)
    
    db.commit()
    db.refresh(db_unit)
    return db_unit

@router.delete("/owned/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_owned_unit(unit_id: int, db: Session = Depends(get_db)):
    unit = db.query(OwnedUnitModel).filter_by(id=unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Unit not found")
    
    db.delete(unit)
    db.commit()
    return None