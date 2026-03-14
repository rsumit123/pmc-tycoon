from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class AircraftBase(BaseModel):
    name: str
    origin: str
    role: str
    generation: str
    image_silhouette: Optional[str] = None
    max_speed_mach: float
    max_speed_loaded_mach: float
    combat_radius_km: int
    service_ceiling_ft: int
    max_g_load: float
    thrust_to_weight_clean: float
    wing_loading_kg_m2: int
    instantaneous_turn_rate_deg_s: int
    sustained_turn_rate_deg_s: int
    empty_weight_kg: int
    max_takeoff_weight_kg: int
    internal_fuel_kg: int
    max_payload_kg: int
    hardpoints: int
    compatible_weapons: str  # JSON list of weapon IDs
    radar_type: str
    radar_range_km: int
    rcs_m2: float
    irst: bool = False
    ecm_suite: Optional[str] = None
    ecm_rating: int = 0
    chaff_count: int = 0
    flare_count: int = 0
    towed_decoy: bool = False
    unlock_cost: int
    maintenance_cost: int
    is_active: bool = True


class AircraftCreate(AircraftBase):
    pass


class Aircraft(AircraftBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True
