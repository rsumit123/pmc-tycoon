from datetime import datetime, UTC
from sqlalchemy import String, Integer, JSON, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    seed: Mapped[int] = mapped_column(Integer)
    starting_year: Mapped[int] = mapped_column(Integer)
    starting_quarter: Mapped[int] = mapped_column(Integer)
    current_year: Mapped[int] = mapped_column(Integer)
    current_quarter: Mapped[int] = mapped_column(Integer)
    difficulty: Mapped[str] = mapped_column(String(32))
    objectives_json: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    budget_cr: Mapped[int] = mapped_column(Integer)
    quarterly_grant_cr: Mapped[int] = mapped_column(Integer, default=155000)
    current_allocation_json: Mapped[dict | None] = mapped_column(JSON, nullable=True, default=None)
    reputation: Mapped[int] = mapped_column(Integer, default=50)
    offensive_unlocked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC), onupdate=lambda: datetime.now(UTC))
