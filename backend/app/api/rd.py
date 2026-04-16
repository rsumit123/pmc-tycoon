from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.rd import start_program, update_program, ProgramNotFound, ProgramAlreadyActive
from app.schemas.rd import RDStartPayload, RDUpdatePayload, RDProgramRead

router = APIRouter(prefix="/api/campaigns", tags=["rd"])


@router.post("/{campaign_id}/rd", response_model=RDProgramRead, status_code=status.HTTP_201_CREATED)
def start_program_endpoint(campaign_id: int, payload: RDStartPayload, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
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
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    try:
        return update_program(
            db, campaign_id, program_id,
            funding_level=payload.funding_level,
            status=payload.status,
        )
    except ProgramNotFound:
        raise HTTPException(status_code=404, detail=f"Program {program_id} not active in this campaign")
