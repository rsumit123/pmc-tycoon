from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.engine.diplomacy import grant_multiplier_pct, tier_from_temperature
from app.models.campaign import Campaign
from app.models.diplomatic_state import DiplomaticState
from app.schemas.diplomacy import DiplomacyResponse, FactionDiplomacy

router = APIRouter(prefix="/api/campaigns/{campaign_id}", tags=["diplomacy"])


@router.get("/diplomacy", response_model=DiplomacyResponse)
def get_diplomacy(campaign_id: int, db: Session = Depends(get_db)):
    if db.get(Campaign, campaign_id) is None:
        raise HTTPException(404, "Campaign not found")
    rows = db.query(DiplomaticState).filter_by(campaign_id=campaign_id).all()
    factions = [
        FactionDiplomacy(
            faction=r.faction,
            temperature_pct=r.temperature_pct,
            tier=tier_from_temperature(r.temperature_pct),
        )
        for r in rows
    ]
    bump = grant_multiplier_pct({f.faction: f.tier for f in factions})
    return DiplomacyResponse(factions=factions, grant_bump_pct=bump)
