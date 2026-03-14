from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.weapon import WeaponType


class WeaponBase(BaseModel):
    name: str
    origin: str
    weapon_type: WeaponType
    weight_kg: int
    max_range_km: int
    no_escape_range_km: int = 0
    min_range_km: int = 0
    speed_mach: float
    guidance: str
    seeker_generation: int = 3
    base_pk: float
    warhead_kg: int
    eccm_rating: int = 50
    maneuverability_g: int = 20
    cost_per_unit: int
    is_active: bool = True


class WeaponCreate(WeaponBase):
    pass


class Weapon(WeaponBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True
