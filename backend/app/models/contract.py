from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base

class Faction(str, enum.Enum):
    ATLANTIC_COALITION = "atlantic_coalition"
    DESERT_BLOC = "desert_bloc"
    PACIFIC_ALLIANCE = "pacific_alliance"
    SAHARA_SINDICATE = "sahara_sindicate"

class MissionStatus(str, enum.Enum):
    PENDING = "pending"
    ACTIVE = "active"
    COMPLETED_SUCCESS = "completed_success"
    COMPLETED_FAILURE = "completed_failure"
    CANCELLED = "cancelled"

class MissionTemplate(Base):
    __tablename__ = "mission_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    faction = Column(Enum(Faction), nullable=False)
    
    # Mission requirements
    required_unit_types = Column(String, nullable=False)  # JSON string of required unit types
    min_unit_count = Column(Integer, default=1)
    max_unit_count = Column(Integer, default=4)
    
    # Rewards and risks
    base_payout = Column(Integer, nullable=False)
    risk_level = Column(Integer, default=50)  # 0-100
    political_impact = Column(Integer, default=0)  # -100 to 100
    
    # Duration
    estimated_duration_hours = Column(Integer, default=24)
    
    # Battle system fields (nullable for legacy missions)
    battle_type = Column(String, nullable=True)  # "air", "naval", or null for legacy
    enemy_aircraft_id = Column(Integer, ForeignKey("aircraft.id"), nullable=True)
    enemy_ship_id = Column(Integer, ForeignKey("ships.id"), nullable=True)

    chapter = Column(String, nullable=True)  # "sahara_crisis", "pacific_tensions", "arctic_shadow", null=standalone
    chapter_order = Column(Integer, default=0)  # ordering within chapter
    min_rank = Column(Integer, default=0)  # 0=STARTUP, 1=LICENSED, 2=ESTABLISHED, 3=ELITE, 4=LEGENDARY

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ActiveContract(Base):
    __tablename__ = "active_contracts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    mission_template_id = Column(Integer, ForeignKey("mission_templates.id"), nullable=False)
    
    # Contract specifics
    status = Column(Enum(MissionStatus), default=MissionStatus.PENDING)
    assigned_units = Column(String, nullable=True)  # JSON string of unit IDs
    assigned_contractors = Column(String, nullable=True)  # JSON string of contractor IDs
    
    # Outcome tracking
    payout_received = Column(Integer, default=0)
    reputation_change = Column(Integer, default=0)
    political_impact_change = Column(Integer, default=0)
    
    # Timestamps
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    user = relationship("User", back_populates="active_contracts")
    mission_template = relationship("MissionTemplate")

class MissionLog(Base):
    __tablename__ = "mission_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    mission_template_id = Column(Integer, ForeignKey("mission_templates.id"), nullable=False)
    
    # Mission details
    status = Column(Enum(MissionStatus), nullable=False)
    payout_earned = Column(Integer, default=0)
    reputation_change = Column(Integer, default=0)
    
    # Battle details (for simulation)
    enemy_strength = Column(Integer, default=0)
    ally_strength = Column(Integer, default=0)
    random_events = Column(String, nullable=True)  # JSON string of events that occurred
    
    # Timestamps
    started_at = Column(DateTime(timezone=True), nullable=False)
    ended_at = Column(DateTime(timezone=True), nullable=False)
    
    # Relationships
    user = relationship("User", back_populates="mission_logs")
    mission_template = relationship("MissionTemplate")