from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class OwnedAircraft(Base):
    __tablename__ = "owned_aircraft"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    aircraft_id = Column(Integer, ForeignKey("aircraft.id"), nullable=False)
    condition = Column(Integer, default=100)  # 0-100%
    assigned_contractor_id = Column(Integer, ForeignKey("owned_contractors.id"), nullable=True)
    acquired_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    aircraft = relationship("Aircraft")
    assigned_contractor = relationship("OwnedContractor", foreign_keys=[assigned_contractor_id])
