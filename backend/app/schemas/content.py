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
    procurable_by: list[str] = []
    default_first_delivery_quarters: int = 8
    default_foc_quarters: int = 20


class PlatformListResponse(BaseModel):
    platforms: list[PlatformOut]


class RDProgramSpecOut(BaseModel):
    id: str
    name: str
    description: str
    base_duration_quarters: int
    base_cost_cr: int
    dependencies: list[str]


class RDProgramSpecListResponse(BaseModel):
    programs: list[RDProgramSpecOut]


class ObjectiveOut(BaseModel):
    id: str
    title: str
    description: str
    weight: int
    target_year: int | None


class ObjectiveListResponse(BaseModel):
    objectives: list[ObjectiveOut]
