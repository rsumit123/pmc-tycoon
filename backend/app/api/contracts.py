from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.contract import MissionTemplate as MissionTemplateModel, ActiveContract as ActiveContractModel, MissionLog as MissionLogModel
from app.schemas.contract import MissionTemplateCreate, MissionTemplateUpdate, MissionTemplate as MissionTemplateSchema, ActiveContractCreate, ActiveContractUpdate, ActiveContract as ActiveContractSchema, MissionLogCreate, MissionLogUpdate, MissionLog as MissionLogSchema

router = APIRouter(prefix="/contracts", tags=["contracts"])

# Mission Templates
@router.get("/templates", response_model=List[MissionTemplateSchema])
def read_mission_templates(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    templates = db.query(MissionTemplateModel).offset(skip).limit(limit).all()
    return templates

@router.post("/templates", response_model=MissionTemplateSchema)
def create_mission_template(template: MissionTemplateCreate, db: Session = Depends(get_db)):
    db_template = MissionTemplateModel(**template.dict())
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template

# Active Contracts
@router.get("/active", response_model=List[ActiveContractSchema])
def read_active_contracts(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    contracts = db.query(ActiveContractModel).offset(skip).limit(limit).all()
    return contracts

@router.post("/active", response_model=ActiveContractSchema)
def create_active_contract(contract: ActiveContractCreate, db: Session = Depends(get_db)):
    db_contract = ActiveContractModel(**contract.dict())
    db.add(db_contract)
    db.commit()
    db.refresh(db_contract)
    return db_contract

@router.get("/active/{contract_id}", response_model=ActiveContractSchema)
def read_active_contract(contract_id: int, db: Session = Depends(get_db)):
    contract = db.query(ActiveContractModel).filter_by(id=contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    return contract

@router.put("/active/{contract_id}", response_model=ActiveContractSchema)
def update_active_contract(contract_id: int, contract: ActiveContractUpdate, db: Session = Depends(get_db)):
    db_contract = db.query(ActiveContractModel).filter_by(id=contract_id).first()
    if not db_contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    update_data = contract.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_contract, key, value)
    
    db.commit()
    db.refresh(db_contract)
    return db_contract

@router.delete("/active/{contract_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_active_contract(contract_id: int, db: Session = Depends(get_db)):
    contract = db.query(ActiveContractModel).filter_by(id=contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    db.delete(contract)
    db.commit()
    return None

# Mission Logs
@router.get("/logs", response_model=List[MissionLogSchema])
def read_mission_logs(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    logs = db.query(MissionLogModel).offset(skip).limit(limit).all()
    return logs

@router.post("/logs", response_model=MissionLogSchema)
def create_mission_log(log: MissionLogCreate, db: Session = Depends(get_db)):
    db_log = MissionLogModel(**log.dict())
    db.add(db_log)
    db.commit()
    db.refresh(db_log)
    return db_log