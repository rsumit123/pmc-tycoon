from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    
    # Game stats
    balance = Column(Integer, default=10000)  # Starting credits
    reputation = Column(Integer, default=50)  # 0-100
    tech_level = Column(Integer, default=1)   # Research level
    research_points = Column(Integer, default=150)  # starting RP
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    owned_units = relationship("OwnedUnit", back_populates="user")
    owned_contractors = relationship("OwnedContractor", back_populates="user")
    active_contracts = relationship("ActiveContract", back_populates="user")
    mission_logs = relationship("MissionLog", back_populates="user")