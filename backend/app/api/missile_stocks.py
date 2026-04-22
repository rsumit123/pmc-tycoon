from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
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


class MissileTransferRequest(BaseModel):
    weapon_id: str
    from_base_id: int
    to_base_id: int
    quantity: int = Field(gt=0)


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


@router.post(
    "/{campaign_id}/missile-stocks/transfer",
    response_model=MissileStockListResponse,
)
def transfer_missile_stock(
    campaign_id: int,
    payload: MissileTransferRequest,
    db: Session = Depends(get_db),
):
    """Transfer missiles between bases within the same campaign.

    Decrements the source depot and credits the destination depot (creating
    a row if one doesn't exist yet). No cost — ground transport is free;
    this models rebasing, not buying.
    """
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(404, "Campaign not found")
    if payload.from_base_id == payload.to_base_id:
        raise HTTPException(400, "from_base_id and to_base_id must differ")

    src = db.query(MissileStock).filter_by(
        campaign_id=campaign_id,
        base_id=payload.from_base_id,
        weapon_id=payload.weapon_id,
    ).first()
    if src is None or src.stock < payload.quantity:
        raise HTTPException(
            400,
            f"Insufficient stock at source base (have {src.stock if src else 0}, need {payload.quantity})",
        )

    dst = db.query(MissileStock).filter_by(
        campaign_id=campaign_id,
        base_id=payload.to_base_id,
        weapon_id=payload.weapon_id,
    ).first()

    src.stock -= payload.quantity
    if dst is None:
        db.add(MissileStock(
            campaign_id=campaign_id,
            base_id=payload.to_base_id,
            weapon_id=payload.weapon_id,
            stock=payload.quantity,
        ))
    else:
        dst.stock += payload.quantity
    db.commit()

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
