from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class OwnedShip(Base):
    __tablename__ = "owned_ships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ship_id = Column(Integer, ForeignKey("ships.id"), nullable=False)
    condition = Column(Integer, default=100)  # 0-100%
    acquired_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    ship = relationship("Ship")
