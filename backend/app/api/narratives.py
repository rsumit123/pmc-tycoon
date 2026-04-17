from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.vignette import get_vignette
from app.crud.narrative import list_narratives
from app.llm import service as llm
from app.llm.client import LLMUnavailableError, LLMRequestError
from app.schemas.narrative import (
    CampaignNarrativeRead, CampaignNarrativeListResponse, GenerateResponse,
)

router = APIRouter(prefix="/api/campaigns", tags=["narratives"])


def _wrap(call, *, kind: str, subject_id: str | None):
    try:
        text, cached = call()
    except llm.NarrativeIneligibleError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except LLMRequestError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except LLMUnavailableError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return GenerateResponse(text=text, cached=cached, kind=kind, subject_id=subject_id)


@router.post("/{campaign_id}/vignettes/{vignette_id}/aar", response_model=GenerateResponse)
def aar_endpoint(campaign_id: int, vignette_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    v = get_vignette(db, campaign_id, vignette_id)
    if v is None:
        raise HTTPException(404, "Vignette not found")
    return _wrap(lambda: llm.generate_aar(db, c, v),
                 kind="aar", subject_id=f"vig-{vignette_id}")


@router.post("/{campaign_id}/intel-briefs/generate", response_model=GenerateResponse)
def intel_brief_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    subj = f"{c.current_year}-Q{c.current_quarter}"
    return _wrap(lambda: llm.generate_intel_brief(db, c),
                 kind="intel_brief", subject_id=subj)


@router.post("/{campaign_id}/vignettes/{vignette_id}/ace-name", response_model=GenerateResponse)
def ace_name_endpoint(campaign_id: int, vignette_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    v = get_vignette(db, campaign_id, vignette_id)
    if v is None:
        raise HTTPException(404, "Vignette not found")
    return _wrap(lambda: llm.generate_ace_name(db, c, v),
                 kind="ace_name", subject_id=None)


@router.post("/{campaign_id}/year-recap/generate", response_model=GenerateResponse)
def year_recap_endpoint(
    campaign_id: int,
    year: int = Query(..., description="The year to recap (must be fully closed)"),
    db: Session = Depends(get_db),
):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    return _wrap(lambda: llm.generate_year_recap(db, c, year),
                 kind="year_recap", subject_id=f"year-{year}")


@router.post("/{campaign_id}/retrospective", response_model=GenerateResponse)
def retrospective_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    return _wrap(lambda: llm.generate_retrospective(db, c),
                 kind="retrospective", subject_id="campaign")


@router.get("/{campaign_id}/narratives", response_model=CampaignNarrativeListResponse)
def list_endpoint(
    campaign_id: int,
    kind: str | None = Query(None),
    db: Session = Depends(get_db),
):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    rows = list_narratives(db, campaign_id, kind=kind)
    return CampaignNarrativeListResponse(
        narratives=[CampaignNarrativeRead.model_validate(r) for r in rows],
    )
