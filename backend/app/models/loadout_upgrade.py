from sqlalchemy import String, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LoadoutUpgrade(Base):
    __tablename__ = "loadout_upgrades"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    squadron_id: Mapped[int] = mapped_column(ForeignKey("squadrons.id"), index=True)
    weapon_id: Mapped[str] = mapped_column(String(64))
    base_loadout: Mapped[list] = mapped_column(JSON)
    completion_year: Mapped[int] = mapped_column(Integer)
    completion_quarter: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    # status: pending | completed | cancelled
