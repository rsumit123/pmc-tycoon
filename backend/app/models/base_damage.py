from sqlalchemy import Boolean, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BaseDamage(Base):
    __tablename__ = "base_damage"
    __table_args__ = (
        UniqueConstraint("campaign_id", "adversary_base_id", name="uq_base_damage_target"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), index=True,
    )
    adversary_base_id: Mapped[int] = mapped_column(
        ForeignKey("adversary_bases.id", ondelete="CASCADE"), index=True,
    )
    shelter_loss_pct: Mapped[int] = mapped_column(Integer, default=0)
    runway_disabled_quarters_remaining: Mapped[int] = mapped_column(Integer, default=0)
    ad_destroyed: Mapped[bool] = mapped_column(Boolean, default=False)
    ad_destroyed_quarters_since: Mapped[int] = mapped_column(Integer, default=0)
    garrisoned_loss: Mapped[int] = mapped_column(Integer, default=0)
