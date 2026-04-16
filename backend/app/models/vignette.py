from sqlalchemy import String, Integer, ForeignKey, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Vignette(Base):
    __tablename__ = "vignettes"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    year: Mapped[int] = mapped_column(Integer)
    quarter: Mapped[int] = mapped_column(Integer)
    scenario_id: Mapped[str] = mapped_column(String(64))
    event_trace: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    aar_text: Mapped[str] = mapped_column(Text, default="")
    outcome: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
