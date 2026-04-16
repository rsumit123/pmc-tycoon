import random
from sqlalchemy.orm import Session

from app.models.campaign import Campaign
from app.models.event import CampaignEvent
from app.schemas.campaign import CampaignCreate


STARTING_BUDGET_CR = 620000  # ~₹6.2L cr annual defense budget


def create_campaign(db: Session, payload: CampaignCreate) -> Campaign:
    seed = payload.seed if payload.seed is not None else random.randint(1, 2**31 - 1)
    campaign = Campaign(
        name=payload.name,
        seed=seed,
        starting_year=2026,
        starting_quarter=2,
        current_year=2026,
        current_quarter=2,
        difficulty=payload.difficulty,
        objectives_json=payload.objectives,
        budget_cr=STARTING_BUDGET_CR,
        reputation=50,
    )
    db.add(campaign)
    db.flush()

    event = CampaignEvent(
        campaign_id=campaign.id,
        year=campaign.starting_year,
        quarter=campaign.starting_quarter,
        event_type="campaign_created",
        payload={"seed": seed, "difficulty": payload.difficulty},
    )
    db.add(event)
    db.commit()
    db.refresh(campaign)
    return campaign


def get_campaign(db: Session, campaign_id: int) -> Campaign | None:
    return db.query(Campaign).filter(Campaign.id == campaign_id).first()
