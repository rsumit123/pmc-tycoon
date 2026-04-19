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


class SplitRequest(BaseModel):
    airframes: int
    target_base_id: int


@router.post("/{campaign_id}/squadrons/{squadron_id}/split", response_model=SquadronResponse)
def split_squadron(
    campaign_id: int,
    squadron_id: int,
    body: SplitRequest,
    db: Session = Depends(get_db),
):
    """Split N airframes off a squadron into a new squadron at a different base.

    Keeps readiness_pct + xp + loadout_override from parent. Parent squadron
    loses N airframes. Fails if N >= parent.strength (can't move everyone)
    or N <= 0.
    """
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(404, "Campaign not found")

    parent = db.query(Squadron).filter(
        Squadron.campaign_id == campaign_id,
        Squadron.id == squadron_id,
    ).first()
    if parent is None:
        raise HTTPException(404, "Squadron not found")

    if body.airframes <= 0:
        raise HTTPException(400, "airframes must be positive")
    if body.airframes >= parent.strength:
        raise HTTPException(400, f"can't split all {parent.strength} airframes — use Rebase instead")

    target = db.query(CampaignBase).filter(
        CampaignBase.campaign_id == campaign_id,
        CampaignBase.id == body.target_base_id,
    ).first()
    if target is None:
        raise HTTPException(404, "Target base not found")

    # Name new squadron sequentially per platform
    existing_count = db.query(Squadron).filter_by(
        campaign_id=campaign_id, platform_id=parent.platform_id,
    ).count()
    new_name = f"{parent.platform_id} Sqn {existing_count + 1}"
    new_call_sign = f"{parent.platform_id[:6].upper()}-{existing_count + 1}"

    new_sqn = Squadron(
        campaign_id=campaign_id,
        base_id=body.target_base_id,
        platform_id=parent.platform_id,
        strength=body.airframes,
        readiness_pct=parent.readiness_pct,
        xp=0,  # new squadron starts fresh — XP stays with parent
        name=new_name,
        call_sign=new_call_sign,
        loadout_override_json=list(parent.loadout_override_json)
            if parent.loadout_override_json else None,
    )
    parent.strength -= body.airframes
    db.add(new_sqn)
    db.commit()
    db.refresh(new_sqn)
    return new_sqn
