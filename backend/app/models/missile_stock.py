from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MissileStock(Base):
    __tablename__ = "missile_stocks"
    __table_args__ = (
        UniqueConstraint(
            "campaign_id", "base_id", "weapon_id",
            name="uq_campaign_base_weapon",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id"), index=True,
    )
    base_id: Mapped[int] = mapped_column(
        ForeignKey("campaign_bases.id"), index=True,
    )
    weapon_id: Mapped[str] = mapped_column(String(64))
    stock: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
