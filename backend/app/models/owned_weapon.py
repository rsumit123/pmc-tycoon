from sqlalchemy import Column, Integer, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class OwnedWeapon(Base):
    __tablename__ = "owned_weapons"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    weapon_id = Column(Integer, ForeignKey("weapons.id"), nullable=False)
    quantity = Column(Integer, default=0)
    acquired_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
    weapon = relationship("Weapon")
