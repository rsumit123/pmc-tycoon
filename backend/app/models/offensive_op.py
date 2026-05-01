from sqlalchemy import ForeignKey, Integer, String, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OffensiveOp(Base):
    __tablename__ = "offensive_ops"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    campaign_id: Mapped[int] = mapped_column(
        ForeignKey("campaigns.id", ondelete="CASCADE"), index=True,
    )
    year: Mapped[int] = mapped_column(Integer)
    quarter: Mapped[int] = mapped_column(Integer)
    target_base_id: Mapped[int] = mapped_column(
        ForeignKey("adversary_bases.id", ondelete="CASCADE"),
    )
    profile: Mapped[str] = mapped_column(String(32))
    roe: Mapped[str] = mapped_column(String(32), default="unrestricted")
    package_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    outcome_json: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    event_trace: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    aar_text: Mapped[str] = mapped_column(String(8000), default="")
    status: Mapped[str] = mapped_column(String(16), default="resolved")
