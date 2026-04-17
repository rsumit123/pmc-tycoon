from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.adversary import list_adversary_states
from app.schemas.adversary import AdversaryListResponse, AdversaryStateRead

router = APIRouter(prefix="/api/campaigns", tags=["adversary"])


@router.get("/{campaign_id}/adversary", response_model=AdversaryListResponse)
def list_adversary_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    rows = list_adversary_states(db, campaign_id)
    return AdversaryListResponse(
        factions=[AdversaryStateRead.model_validate(r) for r in rows],
    )
