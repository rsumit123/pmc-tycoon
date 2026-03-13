from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.contractor import OwnedContractor, ContractorTemplate
from app.schemas.contractor import OwnedContractorCreate, OwnedContractorUpdate, OwnedContractor, ContractorTemplateCreate, ContractorTemplate

router = APIRouter(prefix="/contractors", tags=["contractors"])

# Contractor Templates
@router.get("/templates", response_model=List[ContractorTemplate])
def read_contractor_templates(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    templates = db.query(ContractorTemplate).offset(skip).limit(limit).all()
    return templates

@router.post("/templates", response_model=ContractorTemplate)
def create_contractor_template(template: ContractorTemplateCreate, db: Session = Depends(get_db)):
    db_template = ContractorTemplate(**template.dict())
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template

# Owned Contractors
@router.get("/owned", response_model=List[OwnedContractor])
def read_owned_contractors(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    contractors = db.query(OwnedContractor).offset(skip).limit(limit).all()
    return contractors

@router.post("/owned", response_model=OwnedContractor)
def create_owned_contractor(contractor: OwnedContractorCreate, db: Session = Depends(get_db)):
    db_contractor = OwnedContractor(**contractor.dict())
    db.add(db_contractor)
    db.commit()
    db.refresh(db_contractor)
    return db_contractor

@router.get("/owned/{contractor_id}", response_model=OwnedContractor)
def read_owned_contractor(contractor_id: int, db: Session = Depends(get_db)):
    contractor = db.query(OwnedContractor).filter_by(id=contractor_id).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")
    return contractor

@router.put("/owned/{contractor_id}", response_model=OwnedContractor)
def update_owned_contractor(contractor_id: int, contractor: OwnedContractorUpdate, db: Session = Depends(get_db)):
    db_contractor = db.query(OwnedContractor).filter_by(id=contractor_id).first()
    if not db_contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")
    
    update_data = contractor.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_contractor, key, value)
    
    db.commit()
    db.refresh(db_contractor)
    return db_contractor

@router.delete("/owned/{contractor_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_owned_contractor(contractor_id: int, db: Session = Depends(get_db)):
    contractor = db.query(OwnedContractor).filter_by(id=contractor_id).first()
    if not contractor:
        raise HTTPException(status_code=404, detail="Contractor not found")
    
    db.delete(contractor)
    db.commit()
    return None