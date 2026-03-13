from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class ContractorTemplateBase(BaseModel):
    name: str
    specialization: str  # pilot, operator, technician
    base_skill: int = 50  # 0-100
    base_salary: int
    description: Optional[str] = None
    is_active: bool = True

class ContractorTemplateCreate(ContractorTemplateBase):
    pass

class ContractorTemplateUpdate(BaseModel):
    name: Optional[str] = None
    specialization: Optional[str] = None
    base_skill: Optional[int] = None
    base_salary: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class ContractorTemplate(ContractorTemplateBase):
    id: int
    created_at: datetime
    
    class Config:
        orm_mode = True

class OwnedContractorBase(BaseModel):
    skill_level: int = 50  # 0-100, can be improved
    fatigue_level: int = 0  # 0-100, increases with use
    current_salary: int  # Can change with raises/bonuses

class OwnedContractorCreate(OwnedContractorBase):
    user_id: int
    template_id: int

class OwnedContractorUpdate(BaseModel):
    skill_level: Optional[int] = None
    fatigue_level: Optional[int] = None
    current_salary: Optional[int] = None
    last_rest: Optional[datetime] = None

class OwnedContractor(OwnedContractorBase):
    id: int
    user_id: int
    template_id: int
    hired_at: datetime
    last_rest: Optional[datetime] = None
    
    class Config:
        orm_mode = True