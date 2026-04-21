from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.models.missile_stock import MissileStock


class MissileStockRead(BaseModel):
    id: int
    base_id: int
    weapon_id: str
    stock: int


class MissileStockListResponse(BaseModel):
    stocks: list[MissileStockRead]


router = APIRouter(prefix="/api/campaigns", tags=["missile-stocks"])


@router.get(
    "/{campaign_id}/missile-stocks",
    response_model=MissileStockListResponse,
)
def list_missile_stocks(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(404, "Campaign not found")
    rows = db.query(MissileStock).filter_by(
        campaign_id=campaign_id,
    ).order_by(MissileStock.id.asc()).all()
    return MissileStockListResponse(stocks=[
        MissileStockRead(
            id=r.id, base_id=r.base_id,
            weapon_id=r.weapon_id, stock=r.stock,
        )
        for r in rows
    ])
