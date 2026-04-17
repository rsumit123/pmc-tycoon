from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Squadron(Base):
    __tablename__ = "squadrons"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    call_sign: Mapped[str | None] = mapped_column(String(32), nullable=True, default=None)
    platform_id: Mapped[str] = mapped_column(String(64))
    base_id: Mapped[int] = mapped_column(ForeignKey("campaign_bases.id"), index=True)
    strength: Mapped[int] = mapped_column(Integer)
    readiness_pct: Mapped[int] = mapped_column(Integer, default=80)
    xp: Mapped[int] = mapped_column(Integer, default=0)
    ace_name: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    ace_awarded_year: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    ace_awarded_quarter: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
