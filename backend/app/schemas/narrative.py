from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CampaignNarrativeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    year: int
    quarter: int
    subject_id: str | None
    text: str
    prompt_version: str
    created_at: datetime


class CampaignNarrativeListResponse(BaseModel):
    narratives: list[CampaignNarrativeRead]


class GenerateResponse(BaseModel):
    text: str
    cached: bool
    kind: str
    subject_id: str | None
