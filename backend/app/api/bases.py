from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.base import list_bases_for_campaign
from app.schemas.base import BaseOut, BaseListResponse

router = APIRouter(prefix="/api/campaigns", tags=["bases"])


@router.get("/{campaign_id}/bases", response_model=BaseListResponse)
def list_bases_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = list_bases_for_campaign(db, campaign_id)
    return BaseListResponse(bases=[BaseOut(**r) for r in rows])
