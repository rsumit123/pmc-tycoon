from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.vignette import (
    list_pending_vignettes, get_vignette,
    commit_vignette, CommitValidationError, AlreadyResolvedError,
)
from app.schemas.vignette import VignetteRead, VignetteListResponse, VignetteCommitPayload

router = APIRouter(prefix="/api/campaigns", tags=["vignettes"])


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
    campaign = get_campaign(db, campaign_id)
    if campaign is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
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
