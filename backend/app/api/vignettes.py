from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.vignette import (
    list_pending_vignettes, get_vignette,
    commit_vignette, CommitValidationError, AlreadyResolvedError,
    submit_engagement_result, _squadron_rows,
)
from app.content.registry import platforms as platforms_reg
from app.engine.engagement import build_briefing, EngagementResultError
from app.engine.vignette.bvr import PLATFORM_LOADOUTS
from app.models.missile_stock import MissileStock
from app.models.vignette import Vignette
from app.schemas.vignette import (
    VignetteRead, VignetteListResponse, VignetteCommitPayload,
    EngagementResultPayload, EngagementBriefingResponse,
)

router = APIRouter(prefix="/api/campaigns", tags=["vignettes"])


class CombatHistoryEntry(BaseModel):
    id: int
    year: int
    quarter: int
    scenario_id: str
    scenario_name: str
    ao_name: str
    ao_region: str
    faction: str
    ind_airframes_lost: int
    adv_airframes_lost: int
    ind_kia: int
    adv_kia: int
    objective_met: bool
    resolved_at: str | None
    munitions_cost_cr: int = 0


class CombatHistoryResponse(BaseModel):
    total: int
    wins: int
    losses: int
    vignettes: list[CombatHistoryEntry]


@router.get("/{campaign_id}/combat-history", response_model=CombatHistoryResponse)
def combat_history_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = (
        db.query(Vignette)
        .filter(Vignette.campaign_id == campaign_id, Vignette.status == "resolved")
        .order_by(Vignette.year.desc(), Vignette.quarter.desc(), Vignette.id.desc())
        .all()
    )
    entries: list[CombatHistoryEntry] = []
    wins = 0
    losses = 0
    for v in rows:
        ps = v.planning_state or {}
        oc = v.outcome or {}
        ao = ps.get("ao") or {}
        # Faction — pick first adversary_force entry's faction
        adv = ps.get("adversary_force") or []
        faction = adv[0]["faction"] if adv and "faction" in adv[0] else "UNKNOWN"
        met = bool(oc.get("objective_met"))
        if met:
            wins += 1
        else:
            losses += 1
        entries.append(CombatHistoryEntry(
            id=v.id,
            year=v.year,
            quarter=v.quarter,
            scenario_id=v.scenario_id,
            scenario_name=ps.get("scenario_name", v.scenario_id),
            ao_name=ao.get("name", ""),
            ao_region=ao.get("region", ""),
            faction=faction,
            ind_airframes_lost=int(oc.get("ind_airframes_lost", 0)),
            adv_airframes_lost=int(oc.get("adv_airframes_lost", 0)),
            ind_kia=int(oc.get("ind_kia", 0)),
            adv_kia=int(oc.get("adv_kia", 0)),
            objective_met=met,
            resolved_at=v.resolved_at.isoformat() if v.resolved_at else None,
            munitions_cost_cr=int(oc.get("munitions_cost_total_cr", 0) or 0),
        ))
    return CombatHistoryResponse(
        total=len(entries), wins=wins, losses=losses, vignettes=entries,
    )


@router.get("/{campaign_id}/vignettes/pending", response_model=VignetteListResponse)
def list_pending_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = list_pending_vignettes(db, campaign_id)
    return VignetteListResponse(
        vignettes=[VignetteRead.model_validate(r) for r in rows],
    )


@router.get("/{campaign_id}/vignettes/{vignette_id}", response_model=VignetteRead)
def get_vignette_endpoint(campaign_id: int, vignette_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    v = get_vignette(db, campaign_id, vignette_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vignette not found")
    return VignetteRead.model_validate(v)


@router.post(
    "/{campaign_id}/vignettes/{vignette_id}/commit",
    response_model=VignetteRead,
)
def commit_vignette_endpoint(
    campaign_id: int,
    vignette_id: int,
    payload: VignetteCommitPayload,
    db: Session = Depends(get_db),
):
    from app.api.campaign_lifecycle import require_active_campaign
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    require_active_campaign(campaign)
    v = get_vignette(db, campaign_id, vignette_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vignette not found")
    try:
        resolved = commit_vignette(db, campaign, v, payload.model_dump())
    except CommitValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except AlreadyResolvedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return VignetteRead.model_validate(resolved)


@router.get(
    "/{campaign_id}/vignettes/{vignette_id}/engagement-briefing",
    response_model=EngagementBriefingResponse,
)
def engagement_briefing_endpoint(
    campaign_id: int,
    vignette_id: int,
    db: Session = Depends(get_db),
):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    v = get_vignette(db, campaign_id, vignette_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vignette not found")
    if v.status != "engaged":
        raise HTTPException(status_code=409, detail=f"vignette {v.id} is {v.status}, not engaged")

    ps = v.planning_state or {}
    committed_force = v.committed_force or {}
    squadron_rows = _squadron_rows(db, committed_force)
    depot_stock = {
        (r.base_id, r.weapon_id): r.stock
        for r in db.query(MissileStock).filter_by(campaign_id=campaign_id).all()
    }
    platform_specs = {
        pid: {
            "radar_range_km": p.radar_range_km,
            "rcs_band": p.rcs_band,
            "generation": p.generation,
        }
        for pid, p in platforms_reg().items()
    }
    briefing = build_briefing(
        ps, committed_force, squadron_rows, depot_stock, platform_specs, PLATFORM_LOADOUTS,
    )
    briefing["vignette_id"] = v.id
    return EngagementBriefingResponse.model_validate(briefing)


@router.post(
    "/{campaign_id}/vignettes/{vignette_id}/engagement-result",
    response_model=VignetteRead,
)
def engagement_result_endpoint(
    campaign_id: int,
    vignette_id: int,
    payload: EngagementResultPayload,
    db: Session = Depends(get_db),
):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    v = get_vignette(db, campaign_id, vignette_id)
    if v is None:
        raise HTTPException(status_code=404, detail="Vignette not found")
    try:
        resolved = submit_engagement_result(db, campaign, v, payload.model_dump())
    except EngagementResultError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except CommitValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except AlreadyResolvedError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return VignetteRead.model_validate(resolved)
