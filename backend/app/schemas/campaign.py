from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field


Difficulty = Literal["relaxed", "realistic", "hard_peer", "worst_case"]


class CampaignCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    difficulty: Difficulty = "realistic"
    objectives: list[str] = Field(default_factory=list)
    seed: int | None = None


class CampaignRead(BaseModel):
    id: int
    name: str
    seed: int
    starting_year: int
    starting_quarter: int
    current_year: int
    current_quarter: int
    difficulty: Difficulty
    objectives_json: list[str]
    budget_cr: int
    reputation: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
