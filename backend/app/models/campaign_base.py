from sqlalchemy import String, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CampaignBase(Base):
    __tablename__ = "campaign_bases"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    template_id: Mapped[str] = mapped_column(String(64))
    shelter_count: Mapped[int] = mapped_column(Integer, default=0)
    fuel_depot_size: Mapped[int] = mapped_column(Integer, default=1)
    ad_integration_level: Mapped[int] = mapped_column(Integer, default=1)
    runway_class: Mapped[str] = mapped_column(String(32), default="medium")
