from pydantic import BaseModel


class AdversaryStateRead(BaseModel):
    faction: str
    state: dict

    model_config = {"from_attributes": True}


class AdversaryListResponse(BaseModel):
    factions: list[AdversaryStateRead]
