from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class ResearchItem(Base):
    __tablename__ = "research_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    branch = Column(String, nullable=False)  # "sensors", "propulsion", "ew", "structures", "weapons"
    tier = Column(Integer, default=1)  # 1-3
    cost_money = Column(Integer, default=0)
    cost_rp = Column(Integer, default=0)  # research points
    duration_hours = Column(Integer, default=1)  # how long research takes
    prerequisite_id = Column(Integer, ForeignKey("research_items.id"), nullable=True)
    unlocks_module_name = Column(String, nullable=True)  # name of SubsystemModule this unlocks

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    prerequisite = relationship("ResearchItem", remote_side=[id])


class UserResearch(Base):
    __tablename__ = "user_research"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    research_item_id = Column(Integer, ForeignKey("research_items.id"), nullable=False)
    status = Column(String, default="in_progress")  # "in_progress", "completed"
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")
    research_item = relationship("ResearchItem")
