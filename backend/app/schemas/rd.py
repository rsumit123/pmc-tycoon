from typing import Literal
from pydantic import BaseModel

FundingLevel = Literal["slow", "standard", "accelerated"]
RDStatus = Literal["active", "completed", "cancelled"]


class RDStartPayload(BaseModel):
    program_id: str
    funding_level: FundingLevel = "standard"


class RDUpdatePayload(BaseModel):
    funding_level: FundingLevel | None = None
    status: RDStatus | None = None


class RDProgramRead(BaseModel):
    id: int
    program_id: str
    progress_pct: int
    funding_level: FundingLevel
    status: RDStatus
    milestones_hit: list[int]
    cost_invested_cr: int
    quarters_active: int

    model_config = {"from_attributes": True}


class RDProgramStateListResponse(BaseModel):
    programs: list[RDProgramRead]
