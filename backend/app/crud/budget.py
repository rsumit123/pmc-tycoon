from sqlalchemy.orm import Session

from app.engine.budget import validate_allocation, AllocationError
from app.models.campaign import Campaign


def set_allocation(db: Session, campaign: Campaign, allocation: dict[str, int]) -> Campaign:
    available_cr = campaign.budget_cr + campaign.quarterly_grant_cr
    validate_allocation(allocation, available_cr)
    campaign.current_allocation_json = allocation
    db.commit()
    db.refresh(campaign)
    return campaign
