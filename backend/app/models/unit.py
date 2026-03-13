from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class BaseUnitTemplate(Base):
    __tablename__ = "base_unit_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    unit_type = Column(String, nullable=False)  # fighter, submarine, drone, etc.
    base_cost = Column(Integer, nullable=False)
    base_maintenance_cost = Column(Integer, nullable=False)
    base_attack = Column(Integer, default=0)
    base_defense = Column(Integer, default=0)
    base_speed = Column(Integer, default=0)
    base_range = Column(Integer, default=0)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class OwnedUnit(Base):
    __tablename__ = "owned_units"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    template_id = Column(Integer, ForeignKey("base_unit_templates.id"), nullable=False)
    
    # Instance-specific attributes
    condition = Column(Integer, default=100)  # 0-100%
    current_upgrades = Column(String, nullable=True)  # JSON string of upgrades
    maintenance_cost_multiplier = Column(Float, default=1.0)
    
    # Timestamps
    acquired_at = Column(DateTime(timezone=True), server_default=func.now())
    last_maintenance = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="owned_units")
    template = relationship("BaseUnitTemplate")