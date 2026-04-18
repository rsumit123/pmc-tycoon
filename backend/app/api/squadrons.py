from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.models.squadron import Squadron
from app.models.campaign_base import CampaignBase

router = APIRouter(prefix="/api/campaigns", tags=["squadrons"])


class RebaseRequest(BaseModel):
    target_base_id: int


class SquadronResponse(BaseModel):
    id: int
    name: str
    call_sign: str
    platform_id: str
    base_id: int
    strength: int
    readiness_pct: int
    xp: int

    model_config = ConfigDict(from_attributes=True)


@router.post("/{campaign_id}/squadrons/{squadron_id}/rebase", response_model=SquadronResponse)
def rebase_squadron(
    campaign_id: int,
    squadron_id: int,
    body: RebaseRequest,
    db: Session = Depends(get_db),
):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(404, "Campaign not found")

    sqn = db.query(Squadron).filter(
        Squadron.campaign_id == campaign_id,
        Squadron.id == squadron_id,
    ).first()
    if sqn is None:
        raise HTTPException(404, "Squadron not found")

    target = db.query(CampaignBase).filter(
        CampaignBase.campaign_id == campaign_id,
        CampaignBase.id == body.target_base_id,
    ).first()
    if target is None:
        raise HTTPException(404, "Target base not found")

    sqn.base_id = body.target_base_id
    db.commit()
    db.refresh(sqn)
    return sqn
