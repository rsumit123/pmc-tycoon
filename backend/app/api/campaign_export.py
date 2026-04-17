from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.campaign import Campaign
from app.models.squadron import Squadron
from app.models.campaign_base import CampaignBase
from app.schemas.campaign_export import CampaignExport, SquadronExport, BaseExport

router = APIRouter(prefix="/api/campaigns", tags=["export"])


@router.get("/{campaign_id}/export", response_model=CampaignExport)
def export_campaign(campaign_id: int, db: Session = Depends(get_db)):
    campaign = db.query(Campaign).filter_by(id=campaign_id).first()
    if not campaign:
        raise HTTPException(404, "Campaign not found")

    squads = db.query(Squadron).filter_by(campaign_id=campaign_id).all()
    bases = db.query(CampaignBase).filter_by(campaign_id=campaign_id).all()

    base_id_to_template = {b.id: b.template_id for b in bases}

    return CampaignExport(
        name=campaign.name,
        seed=campaign.seed,
        difficulty=campaign.difficulty,
        starting_year=campaign.starting_year,
        starting_quarter=campaign.starting_quarter,
        current_year=campaign.current_year,
        current_quarter=campaign.current_quarter,
        budget_cr=campaign.budget_cr,
        quarterly_grant_cr=campaign.quarterly_grant_cr,
        reputation=campaign.reputation,
        objectives_json=campaign.objectives_json or [],
        current_allocation_json=campaign.current_allocation_json,
        squadrons=[
            SquadronExport(
                name=s.name,
                call_sign=s.call_sign,
                platform_id=s.platform_id,
                base_template_id=base_id_to_template.get(s.base_id, "unknown"),
                strength=s.strength,
                readiness_pct=s.readiness_pct,
                xp=s.xp,
            )
            for s in squads
        ],
        bases=[
            BaseExport(
                template_id=b.template_id,
                shelter_count=b.shelter_count,
                fuel_depot_size=b.fuel_depot_size,
                ad_integration_level=b.ad_integration_level,
                runway_class=b.runway_class,
            )
            for b in bases
        ],
    )


@router.post("/import", status_code=201)
def import_campaign(data: CampaignExport, db: Session = Depends(get_db)):
    campaign = Campaign(
        name=f"{data.name} (imported)",
        seed=data.seed,
        difficulty=data.difficulty,
        starting_year=data.starting_year,
        starting_quarter=data.starting_quarter,
        current_year=data.current_year,
        current_quarter=data.current_quarter,
        budget_cr=data.budget_cr,
        quarterly_grant_cr=data.quarterly_grant_cr,
        reputation=data.reputation,
        objectives_json=data.objectives_json,
        current_allocation_json=data.current_allocation_json,
    )
    db.add(campaign)
    db.flush()

    template_to_new_id: dict[str, int] = {}
    for b in data.bases:
        base = CampaignBase(
            campaign_id=campaign.id,
            template_id=b.template_id,
            shelter_count=b.shelter_count,
            fuel_depot_size=b.fuel_depot_size,
            ad_integration_level=b.ad_integration_level,
            runway_class=b.runway_class,
        )
        db.add(base)
        db.flush()
        template_to_new_id[b.template_id] = base.id

    for s in data.squadrons:
        base_id = template_to_new_id.get(s.base_template_id)
        if base_id is None:
            continue
        db.add(
            Squadron(
                campaign_id=campaign.id,
                name=s.name,
                call_sign=s.call_sign,
                platform_id=s.platform_id,
                base_id=base_id,
                strength=s.strength,
                readiness_pct=s.readiness_pct,
                xp=s.xp,
            )
        )

    db.commit()
    return {"id": campaign.id}
