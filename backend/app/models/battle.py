from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, DateTime, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.db.base import Base


class BattleType(str, enum.Enum):
    AIR = "air"
    NAVAL = "naval"


class BattleStatus(str, enum.Enum):
    LOADOUT = "loadout"
    IN_PROGRESS = "in_progress"
    COMPLETED_SUCCESS = "completed_success"
    COMPLETED_FAILURE = "completed_failure"
    ABANDONED = "abandoned"


class Battle(Base):
    __tablename__ = "battles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    contract_id = Column(Integer, ForeignKey("active_contracts.id"), nullable=True)
    battle_type = Column(Enum(BattleType), nullable=False)
    status = Column(Enum(BattleStatus), default=BattleStatus.LOADOUT)

    # Platform references (one will be set based on battle_type)
    player_aircraft_id = Column(Integer, ForeignKey("aircraft.id"), nullable=True)
    enemy_aircraft_id = Column(Integer, ForeignKey("aircraft.id"), nullable=True)
    player_ship_id = Column(Integer, ForeignKey("ships.id"), nullable=True)
    enemy_ship_id = Column(Integer, ForeignKey("ships.id"), nullable=True)

    # Contractor (pilot/captain)
    contractor_id = Column(Integer, ForeignKey("owned_contractors.id"), nullable=True)

    # State
    current_phase = Column(Integer, default=1)  # 1-6 for v1, turn number for v2
    engine_version = Column(Integer, default=2)  # 1=old 6-phase, 2=tactical
    player_loadout = Column(String, nullable=True)  # JSON: [{weapon_id, quantity}]
    battle_state = Column(String, nullable=True)  # JSON: full engine state snapshot
    final_result = Column(String, nullable=True)  # JSON: after-action report data

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # Relationships
    user = relationship("User")
    phases = relationship("BattlePhase", back_populates="battle", order_by="BattlePhase.phase_number")


class BattlePhase(Base):
    __tablename__ = "battle_phases"

    id = Column(Integer, primary_key=True, index=True)
    battle_id = Column(Integer, ForeignKey("battles.id"), nullable=False)
    phase_number = Column(Integer, nullable=False)  # 1-6
    phase_name = Column(String, nullable=False)
    player_choice = Column(String, nullable=False)

    # Result (JSON)
    outcome = Column(String, nullable=False)  # JSON: {pk, hit, factors, narrative, ...}

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    battle = relationship("Battle", back_populates="phases")
