from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.contract import Faction, MissionStatus

class MissionTemplateBase(BaseModel):
    title: str
    description: Optional[str] = None
    faction: Faction
    required_unit_types: str  # JSON string
    min_unit_count: int = 1
    max_unit_count: int = 4
    base_payout: int
    risk_level: int = 50  # 0-100
    political_impact: int = 0  # -100 to 100
    estimated_duration_hours: int = 24
    battle_type: Optional[str] = None  # "air", "naval", or null
    enemy_aircraft_id: Optional[int] = None
    enemy_ship_id: Optional[int] = None
    chapter: Optional[str] = None
    chapter_order: int = 0
    min_rank: int = 0
    is_active: bool = True

class MissionTemplateCreate(MissionTemplateBase):
    pass

class MissionTemplateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    faction: Optional[Faction] = None
    required_unit_types: Optional[str] = None
    min_unit_count: Optional[int] = None
    max_unit_count: Optional[int] = None
    base_payout: Optional[int] = None
    risk_level: Optional[int] = None
    political_impact: Optional[int] = None
    estimated_duration_hours: Optional[int] = None
    is_active: Optional[bool] = None

class MissionTemplate(MissionTemplateBase):
    id: int
    created_at: datetime
    
    class Config:
        orm_mode = True

class ActiveContractBase(BaseModel):
    status: MissionStatus = MissionStatus.PENDING
    assigned_units: Optional[str] = None  # JSON string
    assigned_contractors: Optional[str] = None  # JSON string
    payout_received: int = 0
    reputation_change: int = 0
    political_impact_change: int = 0

class ActiveContractCreate(ActiveContractBase):
    user_id: int
    mission_template_id: int
    expires_at: datetime

class ActiveContractUpdate(BaseModel):
    status: Optional[MissionStatus] = None
    assigned_units: Optional[str] = None
    assigned_contractors: Optional[str] = None
    payout_received: Optional[int] = None
    reputation_change: Optional[int] = None
    political_impact_change: Optional[int] = None
    completed_at: Optional[datetime] = None

class ActiveContract(ActiveContractBase):
    id: int
    user_id: int
    mission_template_id: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    expires_at: datetime
    
    class Config:
        orm_mode = True

class MissionLogBase(BaseModel):
    status: MissionStatus
    payout_earned: int = 0
    reputation_change: int = 0
    enemy_strength: int = 0
    ally_strength: int = 0
    random_events: Optional[str] = None  # JSON string

class MissionLogCreate(MissionLogBase):
    user_id: int
    mission_template_id: int
    started_at: datetime
    ended_at: datetime

class MissionLogUpdate(BaseModel):
    status: Optional[MissionStatus] = None
    payout_earned: Optional[int] = None
    reputation_change: Optional[int] = None
    enemy_strength: Optional[int] = None
    ally_strength: Optional[int] = None
    random_events: Optional[str] = None
    ended_at: Optional[datetime] = None

class MissionLog(MissionLogBase):
    id: int
    user_id: int
    mission_template_id: int
    started_at: datetime
    ended_at: datetime
    
    class Config:
        orm_mode = True