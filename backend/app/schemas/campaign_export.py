from pydantic import BaseModel


class SquadronExport(BaseModel):
    name: str
    call_sign: str
    platform_id: str
    base_template_id: str  # resolved from base_id -> template_id
    strength: int
    readiness_pct: int
    xp: int


class BaseExport(BaseModel):
    template_id: str
    shelter_count: int
    fuel_depot_size: int
    ad_integration_level: int
    runway_class: str


class CampaignExport(BaseModel):
    name: str
    seed: int
    difficulty: str
    starting_year: int
    starting_quarter: int
    current_year: int
    current_quarter: int
    budget_cr: int
    quarterly_grant_cr: int
    reputation: int
    objectives_json: list
    current_allocation_json: dict | None
    squadrons: list[SquadronExport]
    bases: list[BaseExport]
