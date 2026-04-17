from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.intel import list_intel_cards
from app.schemas.intel import IntelListResponse, IntelCardRead, SourceType

router = APIRouter(prefix="/api/campaigns", tags=["intel"])


@router.get("/{campaign_id}/intel", response_model=IntelListResponse)
def list_intel_endpoint(
    campaign_id: int,
    year: int | None = Query(None, ge=2026, le=2040),
    quarter: int | None = Query(None, ge=1, le=4),
    source_type: SourceType | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    total, cards = list_intel_cards(
        db, campaign_id,
        year=year, quarter=quarter, source_type=source_type,
        limit=limit, offset=offset,
    )
    return IntelListResponse(
        total=total,
        cards=[IntelCardRead.model_validate(c) for c in cards],
    )
