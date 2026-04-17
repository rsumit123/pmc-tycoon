from typing import Literal
from pydantic import BaseModel


SourceType = Literal["HUMINT", "SIGINT", "IMINT", "OSINT", "ELINT"]


class IntelCardRead(BaseModel):
    id: int
    appeared_year: int
    appeared_quarter: int
    source_type: SourceType
    confidence: float
    truth_value: bool
    payload: dict

    model_config = {"from_attributes": True}


class IntelListResponse(BaseModel):
    total: int
    cards: list[IntelCardRead]
