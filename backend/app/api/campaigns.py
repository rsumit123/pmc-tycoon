from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import create_campaign, get_campaign, advance_turn
from app.models.campaign import Campaign
from app.schemas.campaign import CampaignCreate, CampaignRead, CampaignListItem, CampaignListResponse
from app.schemas.turn_report import (
    TurnReportResponse, RawEvent, DeliverySummary, RDMilestoneSummary,
    VignetteFiredSummary, IntelCardSummary,
)

router = APIRouter(prefix="/api/campaigns", tags=["campaigns"])


@router.post("", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
def create_campaign_endpoint(payload: CampaignCreate, db: Session = Depends(get_db)):
    return create_campaign(db, payload)


@router.get("", response_model=CampaignListResponse)
def list_campaigns_endpoint(db: Session = Depends(get_db)):
    """List all campaigns ordered by most recently updated."""
    campaigns = db.query(Campaign).order_by(Campaign.updated_at.desc()).all()
    return CampaignListResponse(
        campaigns=[CampaignListItem.model_validate(c) for c in campaigns]
    )


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    """Delete a campaign and all its dependent rows."""
    from app.models.squadron import Squadron
    from app.models.campaign_base import CampaignBase
    from app.models.event import CampaignEvent
    from app.models.intel import IntelCard
    from app.models.vignette import Vignette
    from app.models.acquisition import AcquisitionOrder
    from app.models.rd_program import RDProgramState
    from app.models.adversary import AdversaryState
    from app.models.campaign_narrative import CampaignNarrative
    from app.models.ad_battery import ADBattery
    from app.models.loadout_upgrade import LoadoutUpgrade

    camp = db.query(Campaign).get(campaign_id)
    if camp is None:
        raise HTTPException(status_code=404, detail="campaign not found")

    # Delete all dependent rows (no cascade defined in ORM).
    for model in (
        LoadoutUpgrade, ADBattery, CampaignNarrative, AdversaryState,
        RDProgramState, AcquisitionOrder, Vignette, IntelCard,
        CampaignEvent, Squadron, CampaignBase,
    ):
        db.query(model).filter_by(campaign_id=campaign_id).delete(synchronize_session=False)

    db.delete(camp)
    db.commit()
    return None


@router.get("/{campaign_id}/turn-report/{year}/{quarter}", response_model=TurnReportResponse)
def get_turn_report(
    campaign_id: int,
    year: int,
    quarter: int,
    db: Session = Depends(get_db),
):
    """Aggregate events for a completed turn into typed groupings."""
    from app.models.event import CampaignEvent
    from app.models.intel import IntelCard

    rows = (
        db.query(CampaignEvent)
        .filter(
            CampaignEvent.campaign_id == campaign_id,
            CampaignEvent.year == year,
            CampaignEvent.quarter == quarter,
        )
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="no events for that turn")

    deliveries: list[DeliverySummary] = []
    milestones: list[RDMilestoneSummary] = []
    shifts: list[dict] = []
    vig_fired: VignetteFiredSummary | None = None
    treasury_after_cr: int = 0
    allocation: dict | None = None

    for r in rows:
        t = r.event_type
        p = r.payload or {}
        if t == "acquisition_delivery":
            deliveries.append(DeliverySummary(
                order_id=p.get("order_id", 0),
                platform_id=p.get("platform_id", ""),
                count=p.get("count", 0),
                cost_cr=p.get("cost_cr", 0),
                assigned_base_id=p.get("assigned_base_id"),
                assigned_squadron_id=p.get("assigned_squadron_id"),
            ))
        elif t in ("rd_breakthrough", "rd_setback", "rd_milestone", "rd_completed", "rd_underfunded"):
            milestones.append(RDMilestoneSummary(
                program_id=p.get("program_id", ""),
                kind=t.replace("rd_", ""),
                progress_pct=p.get("progress_pct"),
            ))
        elif t.startswith("adversary_") or t.startswith("doctrine_"):
            shifts.append({"event_type": t, "payload": p})
        elif t == "vignette_fired":
            vig_fired = VignetteFiredSummary(
                scenario_id=p.get("scenario_id", ""),
                scenario_name=p.get("scenario_name", ""),
                ao=p.get("ao", {}),
            )
        elif t == "turn_advanced":
            treasury_after_cr = p.get("treasury_after_cr", 0)
            allocation = p.get("allocation")

    # Intel cards are sourced from IntelCard rows (which have headline in payload)
    # rather than the sparse intel_card_generated events.
    intel_card_rows = (
        db.query(IntelCard)
        .filter(
            IntelCard.campaign_id == campaign_id,
            IntelCard.appeared_year == year,
            IntelCard.appeared_quarter == quarter,
        )
        .all()
    )
    intel: list[IntelCardSummary] = [
        IntelCardSummary(
            source_type=ic.source_type,
            confidence=ic.confidence,
            headline=ic.payload.get("headline", "") if ic.payload else "",
        )
        for ic in intel_card_rows
    ]

    return TurnReportResponse(
        campaign_id=campaign_id,
        year=year,
        quarter=quarter,
        events=[RawEvent(event_type=r.event_type, payload=r.payload or {}) for r in rows],
        deliveries=deliveries,
        rd_milestones=milestones,
        adversary_shifts=shifts,
        intel_cards=intel,
        vignette_fired=vig_fired,
        treasury_after_cr=treasury_after_cr,
        allocation=allocation,
    )


@router.get("/{campaign_id}", response_model=CampaignRead)
def get_campaign_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return campaign


@router.post("/{campaign_id}/advance", response_model=CampaignRead)
def advance_turn_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return advance_turn(db, campaign)
