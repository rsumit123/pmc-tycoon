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
    squadrons: list[BaseSquadronOut]


class BaseListResponse(BaseModel):
    bases: list[BaseOut]
