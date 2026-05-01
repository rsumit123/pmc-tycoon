from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class DiplomaticState(Base):
    __tablename__ = "diplomatic_states"
    __table_args__ = (
        UniqueConstraint("campaign_id", "faction", name="uq_diplo_campaign_faction"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), index=True,
    )
    faction: Mapped[str] = mapped_column(String(16), index=True)
    temperature_pct: Mapped[int] = mapped_column(Integer, default=50)
