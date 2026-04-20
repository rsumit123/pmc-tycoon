from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.campaign_lifecycle import require_active_campaign
from app.crud.campaign import get_campaign
from app.crud.rd import start_program, update_program, list_active_programs, ProgramNotFound, ProgramAlreadyActive
from app.engine.rd import project_completion
from app.content.registry import rd_programs
from app.schemas.rd import RDStartPayload, RDUpdatePayload, RDProgramRead, RDProgramStateListResponse

router = APIRouter(prefix="/api/campaigns", tags=["rd"])


@router.get("/{campaign_id}/rd", response_model=RDProgramStateListResponse)
def list_rd_programs_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = list_active_programs(db, campaign_id)

    # Compute projections for each program
    rd_specs = rd_programs()
    programs = []
    for r in rows:
        prog_dict = RDProgramRead.model_validate(r).model_dump()

        # Only compute projections for active programs not yet completed
        if r.status == "active" and r.progress_pct < 100:
            spec = rd_specs.get(r.program_id)
            if spec:
                projections = {
                    lvl: project_completion(
                        progress_pct=r.progress_pct,
                        base_duration_quarters=spec.base_duration_quarters,
                        base_cost_cr=spec.base_cost_cr,
                        funding_level=lvl,
                        current_year=campaign.current_year,
                        current_quarter=campaign.current_quarter,
                    )
                    for lvl in ("slow", "standard", "accelerated")
                }
                prog_dict["projections"] = projections

        programs.append(RDProgramRead(**prog_dict))

    return RDProgramStateListResponse(programs=programs)


@router.post("/{campaign_id}/rd", response_model=RDProgramRead, status_code=status.HTTP_201_CREATED)
def start_program_endpoint(campaign_id: int, payload: RDStartPayload, db: Session = Depends(get_db)):
    camp = get_campaign(db, campaign_id)
    if camp is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    require_active_campaign(camp)
    try:
        return start_program(db, campaign_id, payload.program_id, payload.funding_level)
    except ProgramNotFound:
        raise HTTPException(status_code=404, detail=f"Program {payload.program_id} not in registry")
    except ProgramAlreadyActive:
        raise HTTPException(status_code=409, detail=f"Program {payload.program_id} already active")


@router.post("/{campaign_id}/rd/{program_id}", response_model=RDProgramRead)
def update_program_endpoint(
    campaign_id: int,
    program_id: str,
    payload: RDUpdatePayload,
    db: Session = Depends(get_db),
):
    camp = get_campaign(db, campaign_id)
    if camp is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    require_active_campaign(camp)
    try:
        return update_program(
            db, campaign_id, program_id,
            funding_level=payload.funding_level,
            status=payload.status,
        )
    except ProgramNotFound:
        raise HTTPException(status_code=404, detail=f"Program {program_id} not active in this campaign")
