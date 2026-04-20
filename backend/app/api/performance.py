from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.engine.performance import compute_performance
from app.models.vignette import Vignette
from app.schemas.performance import PerformanceResponse

router = APIRouter(prefix="/api/campaigns", tags=["performance"])


@router.get("/{campaign_id}/performance", response_model=PerformanceResponse)
def get_performance_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")

    rows = (
        db.query(Vignette)
        .filter(Vignette.campaign_id == campaign_id, Vignette.status == "resolved")
        .all()
    )
    vignette_dicts = [
        {
            "planning_state": v.planning_state or {},
            "committed_force": v.committed_force or {},
            "event_trace": v.event_trace or [],
            "outcome": v.outcome or {},
        }
        for v in rows
    ]

    # Build lookup tables from the content registries so aggregations can
    # enrich rows with display names + weapon classes without another query.
    from app.content.registry import platforms as platforms_reg
    from app.engine.vignette.bvr import WEAPONS
    platforms_by_id = {
        pid: {"name": p.name}
        for pid, p in platforms_reg().items()
    }
    weapons_by_id = {
        wid: {"unit_cost_cr": spec.get("unit_cost_cr", 0), "class": spec.get("class", "a2a_bvr")}
        for wid, spec in WEAPONS.items()
    }

    bundle = compute_performance(vignette_dicts, platforms_by_id, weapons_by_id)
    return PerformanceResponse(**bundle)
