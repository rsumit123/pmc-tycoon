from pydantic import BaseModel


class ObjectiveProgressEntry(BaseModel):
    id: str
    name: str
    status: str
    progress: float
    detail: str


class ObjectiveProgressListResponse(BaseModel):
    objectives: list[ObjectiveProgressEntry]
