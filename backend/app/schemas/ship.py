from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.ship import ShipType


class ShipBase(BaseModel):
    name: str
    class_name: str
    origin: str
    ship_type: ShipType
    image_silhouette: Optional[str] = None
    image_url: Optional[str] = None
    displacement_tons: int
    max_speed_knots: int
    crew: int
    radar_type: str
    radar_range_km: int
    sonar: Optional[str] = None
    helicopter: Optional[str] = None
    anti_ship_missiles: Optional[str] = None  # JSON
    sam_systems: Optional[str] = None  # JSON
    ciws: Optional[str] = None  # JSON
    torpedoes: Optional[str] = None  # JSON
    gun: Optional[str] = None
    ecm_suite: Optional[str] = None
    ecm_rating: int = 0
    decoys: Optional[str] = None
    compartments: int = 10
    unlock_cost: int
    maintenance_cost: int
    is_active: bool = True


class ShipCreate(ShipBase):
    pass


class Ship(ShipBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True
