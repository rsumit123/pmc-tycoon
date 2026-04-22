from pydantic import BaseModel


class SightingRead(BaseModel):
    tier: str  # "low" | "medium" | "high"
    year: int
    quarter: int
    count_range: tuple[int, int] | None = None
    platforms: list[str] | None = None
    platforms_detailed: dict[str, int] | None = None
    readiness: str | None = None
    covering_drones: list[str] = []


class AdversaryBaseRead(BaseModel):
    id: int
    base_id_str: str
    name: str
    faction: str
    lat: float
    lon: float
    tier: str
    is_covered: bool
    latest_sighting: SightingRead | None = None


class AdversaryBaseListResponse(BaseModel):
    bases: list[AdversaryBaseRead]
