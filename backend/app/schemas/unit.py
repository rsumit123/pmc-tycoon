from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class BaseUnitTemplateBase(BaseModel):
    name: str
    unit_type: str
    base_cost: int
    base_maintenance_cost: int
    base_attack: int = 0
    base_defense: int = 0
    base_speed: int = 0
    base_range: int = 0
    description: Optional[str] = None
    is_active: bool = True

class BaseUnitTemplateCreate(BaseUnitTemplateBase):
    pass

class BaseUnitTemplateUpdate(BaseModel):
    name: Optional[str] = None
    unit_type: Optional[str] = None
    base_cost: Optional[int] = None
    base_maintenance_cost: Optional[int] = None
    base_attack: Optional[int] = None
    base_defense: Optional[int] = None
    base_speed: Optional[int] = None
    base_range: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class BaseUnitTemplate(BaseUnitTemplateBase):
    id: int
    created_at: datetime
    
    class Config:
        orm_mode = True

class OwnedUnitBase(BaseModel):
    condition: int = 100  # 0-100%
    current_upgrades: Optional[str] = None  # JSON string
    maintenance_cost_multiplier: float = 1.0

class OwnedUnitCreate(OwnedUnitBase):
    user_id: int
    template_id: int

class OwnedUnitUpdate(BaseModel):
    condition: Optional[int] = None
    current_upgrades: Optional[str] = None
    maintenance_cost_multiplier: Optional[float] = None
    last_maintenance: Optional[datetime] = None

class OwnedUnit(OwnedUnitBase):
    id: int
    user_id: int
    template_id: int
    acquired_at: datetime
    last_maintenance: Optional[datetime] = None
    
    class Config:
        orm_mode = True