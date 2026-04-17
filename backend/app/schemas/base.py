from pydantic import BaseModel


class BaseSquadronOut(BaseModel):
    id: int
    name: str
    call_sign: str
    platform_id: str
    strength: int
    readiness_pct: int
    xp: int
    ace_name: str | None


class BaseOut(BaseModel):
    id: int
    template_id: str
    name: str
    lat: float
    lon: float
    shelter_count: int = 0
    fuel_depot_size: int = 1
    ad_integration_level: int = 1
    runway_class: str = "medium"
    squadrons: list[BaseSquadronOut]


class BaseListResponse(BaseModel):
    bases: list[BaseOut]
