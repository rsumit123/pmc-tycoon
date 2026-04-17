from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


VignetteStatus = Literal["pending", "resolved"]


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
