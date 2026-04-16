from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import create_campaign, get_campaign
from app.schemas.campaign import CampaignCreate, CampaignRead

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@router.post("", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
def create_campaign_endpoint(payload: CampaignCreate, db: Session = Depends(get_db)):
    return create_campaign(db, payload)


@router.get("/{campaign_id}", response_model=CampaignRead)
def get_campaign_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign
