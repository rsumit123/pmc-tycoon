from sqlalchemy.orm import Session

from app.models.acquisition import AcquisitionOrder
from app.models.ad_battery import ADBattery
from app.models.campaign import Campaign
from app.content.registry import platforms, ad_systems
from app.engine.vignette.bvr import WEAPONS


class PlatformNotFound(Exception):
    pass


class InvalidDeliveryWindow(Exception):
    pass


class InvalidKindPayload(Exception):
    pass


_ALLOWED_KINDS = ("platform", "missile_batch", "ad_battery", "ad_reload")


def _quarter_index(year: int, quarter: int) -> int:
    return year * 4 + (quarter - 1)


def _validate_kind_resource(
    db: Session, campaign: Campaign, kind: str, resource_id: str,
    target_battery_id: int | None,
) -> None:
    """kind-specific validation of resource_id + target_battery_id."""
    if kind not in _ALLOWED_KINDS:
        raise InvalidKindPayload(f"unknown kind {kind!r}")
    if kind == "platform":
        if resource_id not in platforms():
            raise PlatformNotFound(resource_id)
    elif kind == "missile_batch":
        if resource_id not in WEAPONS:
            raise InvalidKindPayload(f"weapon {resource_id!r} not in registry")
    elif kind == "ad_battery":
        if resource_id not in ad_systems():
            raise InvalidKindPayload(f"ad system {resource_id!r} not in registry")
    elif kind == "ad_reload":
        if target_battery_id is None:
            raise InvalidKindPayload(
                "ad_reload kind requires target_battery_id",
            )
        battery = db.query(ADBattery).filter_by(
            id=target_battery_id, campaign_id=campaign.id,
        ).first()
        if battery is None:
            raise InvalidKindPayload(
                f"target_battery_id {target_battery_id} not found for campaign",
            )


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
    kind: str = "platform",
    target_battery_id: int | None = None,
) -> AcquisitionOrder:
    _validate_kind_resource(db, campaign, kind, platform_id, target_battery_id)
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
        kind=kind,
        target_battery_id=target_battery_id,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def list_orders(db: Session, campaign_id: int):
    return db.query(AcquisitionOrder).filter(
        AcquisitionOrder.campaign_id == campaign_id
    ).order_by(AcquisitionOrder.id.asc()).all()
