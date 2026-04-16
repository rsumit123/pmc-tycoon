from pydantic import BaseModel, Field


class BudgetAllocationPayload(BaseModel):
    allocation: dict[str, int] = Field(default_factory=dict)
