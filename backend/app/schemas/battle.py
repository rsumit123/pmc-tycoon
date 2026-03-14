from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.battle import BattleType, BattleStatus


class BattleCreate(BaseModel):
    contract_id: Optional[int] = None
    aircraft_id: Optional[int] = None
    ship_id: Optional[int] = None
    contractor_id: Optional[int] = None


class LoadoutSubmit(BaseModel):
    weapons: List[dict]  # [{weapon_id: int, quantity: int}]


class BattleChoiceSubmit(BaseModel):
    choice: str


class BattlePhaseResponse(BaseModel):
    phase_number: int
    phase_name: str
    player_choice: str
    outcome: str  # JSON string

    class Config:
        orm_mode = True


class BattleResponse(BaseModel):
    id: int
    battle_type: BattleType
    status: BattleStatus
    current_phase: int
    player_loadout: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        orm_mode = True
