from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.campaign import Campaign
from app.models.campaign_base import CampaignBase
from app.schemas.base_upgrade import BaseUpgradeRequest, BaseUpgradeResponse
from app.engine.base_upgrade import upgrade_cost, UPGRADE_CAPS, RUNWAY_LEVELS, RUNWAY_NAMES

router = APIRouter(prefix="/api/campaigns", tags=["bases"])


@router.post("/{campaign_id}/bases/{base_template_id}/upgrade", response_model=BaseUpgradeResponse)
def upgrade_base(
    campaign_id: int,
    base_template_id: str,
    req: BaseUpgradeRequest,
    db: Session = Depends(get_db),
):
    from app.api.campaign_lifecycle import require_active_campaign
    campaign = db.query(Campaign).filter_by(id=campaign_id).first()
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    require_active_campaign(campaign)

    base = db.query(CampaignBase).filter_by(
        campaign_id=campaign_id, template_id=base_template_id
    ).first()
    if not base:
        raise HTTPException(404, f"Base {base_template_id} not found")

    cost = upgrade_cost(req.upgrade_type)
    if campaign.budget_cr < cost:
        raise HTTPException(
            400, f"Insufficient funds: need {cost} cr, have {campaign.budget_cr} cr"
        )

    # Apply the upgrade
    if req.upgrade_type == "shelter":
        if base.shelter_count >= UPGRADE_CAPS["shelter"]:
            raise HTTPException(400, "Shelters already at maximum")
        base.shelter_count = min(base.shelter_count + 4, UPGRADE_CAPS["shelter"])
    elif req.upgrade_type == "fuel_depot":
        if base.fuel_depot_size >= UPGRADE_CAPS["fuel_depot"]:
            raise HTTPException(400, "Fuel depot already at maximum")
        base.fuel_depot_size += 1
    elif req.upgrade_type == "ad_integration":
        if base.ad_integration_level >= UPGRADE_CAPS["ad_integration"]:
            raise HTTPException(400, "AD integration already at maximum")
        base.ad_integration_level += 1
    elif req.upgrade_type == "runway":
        current_level = RUNWAY_LEVELS.get(base.runway_class, 2)
        if current_level >= UPGRADE_CAPS["runway"]:
            raise HTTPException(400, "Runway already at maximum")
        base.runway_class = RUNWAY_NAMES[current_level + 1]

    campaign.budget_cr -= cost
    db.commit()
    db.refresh(base)
    db.refresh(campaign)

    return BaseUpgradeResponse(
        base_template_id=base_template_id,
        upgrade_type=req.upgrade_type,
        cost_cr=cost,
        shelter_count=base.shelter_count,
        fuel_depot_size=base.fuel_depot_size,
        ad_integration_level=base.ad_integration_level,
        runway_class=base.runway_class,
        remaining_budget_cr=campaign.budget_cr,
    )
