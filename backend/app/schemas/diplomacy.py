from pydantic import BaseModel


class FactionDiplomacy(BaseModel):
    faction: str
    temperature_pct: int
    tier: str


class DiplomacyResponse(BaseModel):
    factions: list[FactionDiplomacy]
    grant_bump_pct: int
