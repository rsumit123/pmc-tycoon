from sqlalchemy.orm import Session

from app.models.acquisition import AcquisitionOrder
from app.models.campaign import Campaign
from app.content.registry import platforms


class PlatformNotFound(Exception):
    pass


class InvalidDeliveryWindow(Exception):
    pass


def _quarter_index(year: int, quarter: int) -> int:
    return year * 4 + (quarter - 1)


def create_order(
    db: Session,
    campaign: Campaign,
    platform_id: str,
    quantity: int,
    first_delivery_year: int,
    first_delivery_quarter: int,
    foc_year: int,
    foc_quarter: int,
    total_cost_cr: int,
    preferred_base_id: int | None = None,
) -> AcquisitionOrder:
    if platform_id not in platforms():
        raise PlatformNotFound(platform_id)
    if _quarter_index(foc_year, foc_quarter) < _quarter_index(first_delivery_year, first_delivery_quarter):
        raise InvalidDeliveryWindow("FOC must be on or after first delivery")
    order = AcquisitionOrder(
        campaign_id=campaign.id,
        platform_id=platform_id,
        quantity=quantity,
        signed_year=campaign.current_year,
        signed_quarter=campaign.current_quarter,
        first_delivery_year=first_delivery_year,
        first_delivery_quarter=first_delivery_quarter,
        foc_year=foc_year,
        foc_quarter=foc_quarter,
        delivered=0,
        total_cost_cr=total_cost_cr,
        preferred_base_id=preferred_base_id,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def list_orders(db: Session, campaign_id: int):
    return db.query(AcquisitionOrder).filter(
        AcquisitionOrder.campaign_id == campaign_id
    ).order_by(AcquisitionOrder.id.asc()).all()
