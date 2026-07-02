from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


VignetteStatus = Literal["pending", "engaged", "resolved"]


class VignetteCommitSquadron(BaseModel):
    squadron_id: int
    airframes: int = Field(ge=1)


class VignetteCommitSupport(BaseModel):
    awacs: bool = False
    tanker: bool = False
    sead_package: bool = False


class VignetteCommitPayload(BaseModel):
    squadrons: list[VignetteCommitSquadron] = Field(default_factory=list)
    support: VignetteCommitSupport = Field(default_factory=VignetteCommitSupport)
    roe: str = "weapons_free"
    decline: bool = False
    mode: Literal["auto", "interactive"] = "auto"


class EngagementResultPayload(BaseModel):
    player_squadron_id: int
    flight_kills: dict[str, int] = Field(default_factory=dict)   # platform_id -> count
    flight_losses: int = Field(ge=0, default=0)
    munitions_expended: dict[str, int] = Field(default_factory=dict)  # weapon_id -> count
    flares_used: int = Field(ge=0, default=0)
    disengaged: bool = False


class EngagementBriefingResponse(BaseModel):
    vignette_id: int
    ao: dict
    roe: str
    support: dict
    time_budget_s: int
    flare_stock: int
    player_squadrons: list[dict]
    adversary: list[dict]


class VignetteRead(BaseModel):
    id: int
    year: int
    quarter: int
    scenario_id: str
    status: VignetteStatus
    planning_state: dict
    committed_force: dict | None
    event_trace: list
    aar_text: str
    outcome: dict
    resolved_at: datetime | None

    model_config = {"from_attributes": True}


class VignetteListResponse(BaseModel):
    vignettes: list[VignetteRead]
