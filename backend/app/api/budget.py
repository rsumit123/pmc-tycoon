from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.budget import set_allocation
from app.crud.campaign import get_campaign
from app.engine.budget import AllocationError
from app.schemas.budget import BudgetAllocationPayload
from app.schemas.campaign import CampaignRead

router = APIRouter(prefix="/api/campaigns", tags=["budget"])


@router.post("/{campaign_id}/budget", response_model=CampaignRead)
def set_budget_endpoint(campaign_id: int, payload: BudgetAllocationPayload, db: Session = Depends(get_db)):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        return set_allocation(db, campaign, payload.allocation)
    except AllocationError as e:
        raise HTTPException(status_code=400, detail=str(e))
