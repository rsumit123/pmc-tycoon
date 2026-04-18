from sqlalchemy import String, Integer, ForeignKey, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AdversaryState(Base):
    __tablename__ = "adversary_states"
    __table_args__ = (
        UniqueConstraint("campaign_id", "faction", name="uq_adversary_campaign_faction"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    faction: Mapped[str] = mapped_column(String(32))
    state: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
