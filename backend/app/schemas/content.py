from pydantic import BaseModel


class PlatformOut(BaseModel):
    id: str
    name: str
    origin: str
    role: str
    generation: str
    combat_radius_km: int
    payload_kg: int
    rcs_band: str
    radar_range_km: int
    cost_cr: int
    intro_year: int


class PlatformListResponse(BaseModel):
    platforms: list[PlatformOut]
