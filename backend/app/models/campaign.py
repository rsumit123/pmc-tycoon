from datetime import datetime
from sqlalchemy import String, Integer, JSON, DateTime
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
    objectives_json: Mapped[list] = mapped_column(JSON, default=list)
    budget_cr: Mapped[int] = mapped_column(Integer)
    reputation: Mapped[int] = mapped_column(Integer, default=50)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
