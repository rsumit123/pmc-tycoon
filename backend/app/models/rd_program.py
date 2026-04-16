from sqlalchemy import String, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RDProgramState(Base):
    __tablename__ = "rd_program_states"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    program_id: Mapped[str] = mapped_column(String(64))
    progress_pct: Mapped[int] = mapped_column(Integer, default=0)
    funding_level: Mapped[str] = mapped_column(String(32), default="standard")
    status: Mapped[str] = mapped_column(String(32), default="active")
    milestones_hit: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    cost_invested_cr: Mapped[int] = mapped_column(Integer, default=0)
    quarters_active: Mapped[int] = mapped_column(Integer, default=0)
