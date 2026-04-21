from sqlalchemy import String, Integer, ForeignKey, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AcquisitionOrder(Base):
    __tablename__ = "acquisition_orders"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    platform_id: Mapped[str] = mapped_column(String(64))
    quantity: Mapped[int] = mapped_column(Integer)
    signed_year: Mapped[int] = mapped_column(Integer)
    signed_quarter: Mapped[int] = mapped_column(Integer)
    first_delivery_year: Mapped[int] = mapped_column(Integer)
    first_delivery_quarter: Mapped[int] = mapped_column(Integer)
    foc_year: Mapped[int] = mapped_column(Integer)
    foc_quarter: Mapped[int] = mapped_column(Integer)
    delivered: Mapped[int] = mapped_column(Integer, default=0)
    total_cost_cr: Mapped[int] = mapped_column(Integer, default=0)
    cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    preferred_base_id: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    kind: Mapped[str] = mapped_column(String(32), default="platform", nullable=False)
    target_battery_id: Mapped[int | None] = mapped_column(
        Integer, nullable=True, default=None,
    )
