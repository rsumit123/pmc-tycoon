from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class ContractorTemplate(Base):
    __tablename__ = "contractor_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    specialization = Column(String, nullable=False)  # pilot, operator, technician
    base_skill = Column(Integer, default=50)  # 0-100
    base_salary = Column(Integer, nullable=False)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class OwnedContractor(Base):
    __tablename__ = "owned_contractors"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    template_id = Column(Integer, ForeignKey("contractor_templates.id"), nullable=False)
    
    # Instance-specific attributes
    skill_level = Column(Integer, default=50)  # 0-100, can be improved
    fatigue_level = Column(Integer, default=0)  # 0-100, increases with use
    current_salary = Column(Integer, nullable=False)  # Can change with raises/bonuses
    xp = Column(Integer, default=0)
    level = Column(Integer, default=1)
    
    # Timestamps
    hired_at = Column(DateTime(timezone=True), server_default=func.now())
    last_rest = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="owned_contractors")
    template = relationship("ContractorTemplate")