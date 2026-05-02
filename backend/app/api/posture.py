"""Strategic posture rollup — single endpoint feeding the Ops Posture dashboard."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.content.registry import platforms as _plats
from app.engine.diplomacy import tier_from_temperature
from app.models.acquisition import AcquisitionOrder
from app.models.campaign import Campaign
from app.models.diplomatic_state import DiplomaticState
from app.models.event import CampaignEvent
from app.models.offensive_op import OffensiveOp
from app.models.rd_program import RDProgramState
from app.models.squadron import Squadron
from app.schemas.posture import FleetSummaryEntry, PostureResponse, TreasurySnap

router = APIRouter(prefix="/api/campaigns/{campaign_id}", tags=["posture"])


@router.get("/posture", response_model=PostureResponse)
def get_posture(campaign_id: int, db: Session = Depends(get_db)):
    camp = db.get(Campaign, campaign_id)
    if camp is None:
        raise HTTPException(404, "Campaign not found")

    grant = camp.quarterly_grant_cr or 1
    runway = max(0, camp.budget_cr // max(1, grant // 2))

    plats = _plats()
    sqns = db.query(Squadron).filter_by(campaign_id=campaign_id).all()
    role_buckets: dict[str, list[Squadron]] = {}
    for sq in sqns:
        spec = plats.get(sq.platform_id)
        role = (spec.role if spec else "other") or "other"
        role_buckets.setdefault(role, []).append(sq)
    fleet = [
        FleetSummaryEntry(
            role=role,
            airframes=sum(s.strength for s in group),
            avg_readiness_pct=int(sum(s.readiness_pct for s in group) / max(1, len(group))),
        )
        for role, group in sorted(role_buckets.items())
    ]

    # 8-quarter threat history by faction (event-count based).
    eight_q_floor = (camp.current_year * 4 + camp.current_quarter - 1) - 8
    evs = (
        db.query(CampaignEvent)
        .filter(
            CampaignEvent.campaign_id == campaign_id,
            CampaignEvent.event_type == "vignette_fired",
        )
        .all()
    )
    history: dict[str, list[float]] = {"PAF": [0]*8, "PLAAF": [0]*8, "PLAN": [0]*8}
    for ev in evs:
        idx = ev.year * 4 + ev.quarter - 1
        if idx < eight_q_floor:
            continue
        bucket = idx - eight_q_floor
        if 0 <= bucket < 8:
            faction = (ev.payload or {}).get("faction") or "PAF"
            if faction in history:
                history[faction][bucket] += 1

    orders = db.query(AcquisitionOrder).filter_by(campaign_id=campaign_id).all()
    active = [o for o in orders if not o.cancelled and o.delivered < o.quantity]
    nearest = None
    if active:
        soonest = min(active, key=lambda o: (o.foc_year, o.foc_quarter))
        nearest = {
            "platform_id": soonest.platform_id,
            "kind": getattr(soonest, "kind", "platform"),
            "foc_year": soonest.foc_year,
            "foc_quarter": soonest.foc_quarter,
        }

    rd_rows = db.query(RDProgramState).filter_by(campaign_id=campaign_id).all()
    rd_active = sum(1 for r in rd_rows if r.status == "active")
    rd_completed = sum(1 for r in rd_rows if r.status == "completed")

    diplo = {
        r.faction: tier_from_temperature(r.temperature_pct)
        for r in db.query(DiplomaticState).filter_by(campaign_id=campaign_id).all()
    }

    strikes_this_q = (
        db.query(OffensiveOp)
        .filter_by(
            campaign_id=campaign_id,
            year=camp.current_year, quarter=camp.current_quarter,
        )
        .count()
    )

    return PostureResponse(
        treasury=TreasurySnap(
            treasury_cr=camp.budget_cr,
            quarterly_grant_cr=grant,
            runway_quarters=runway,
        ),
        fleet_by_role=fleet,
        threat_history_by_faction=history,
        total_active_orders=len(active),
        nearest_delivery=nearest,
        rd_active_count=rd_active,
        rd_completed_count=rd_completed,
        diplomacy_summary=diplo,
        offensive_unlocked=camp.offensive_unlocked,
        strikes_this_quarter=strikes_this_q,
    )
