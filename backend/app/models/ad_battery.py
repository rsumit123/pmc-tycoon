from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ADBattery(Base):
    __tablename__ = "ad_batteries"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    base_id: Mapped[int] = mapped_column(ForeignKey("campaign_bases.id"), index=True)
    system_id: Mapped[str] = mapped_column(String(64))
    coverage_km: Mapped[int] = mapped_column(Integer)
    installed_year: Mapped[int] = mapped_column(Integer)
    installed_quarter: Mapped[int] = mapped_column(Integer)
