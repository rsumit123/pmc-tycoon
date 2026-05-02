from pydantic import BaseModel, Field


class StrikeSquadronEntry(BaseModel):
    squadron_id: int
    airframes: int = Field(gt=0)


class StrikePackageRequest(BaseModel):
    target_base_id: int
    profile: str
    squadrons: list[StrikeSquadronEntry]
    weapons_planned: dict[str, int] = Field(default_factory=dict)
    support: dict[str, bool] = Field(default_factory=dict)
    roe: str = "unrestricted"


class StrikePreviewResponse(BaseModel):
    issues: list[str]
    forecast: dict
    weapons_avail: dict[str, int]
    intel_quality: str


class StrikeRead(BaseModel):
    id: int
    year: int
    quarter: int
    target_base_id: int
    profile: str
    roe: str
    package_json: dict
    outcome_json: dict
    event_trace: list
    aar_text: str
    status: str

    model_config = {"from_attributes": True}


class StrikeListResponse(BaseModel):
    strikes: list[StrikeRead]
