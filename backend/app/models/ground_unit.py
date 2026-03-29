from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class GroundUnit(Base):
    __tablename__ = "ground_units"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    unit_type = Column(String, nullable=False)  # infantry, rpg_team, sniper, manpads, spec_ops, ifv, light_tank, mbt, tank_destroyer, mortar, sph, mlrs, drone_isr, drone_attack
    role = Column(String, nullable=False)
    description = Column(String, nullable=True)
    origin = Column(String, nullable=False)
    image_url = Column(String, nullable=True)
    combat_power = Column(Integer, nullable=False)   # 1-100 base effectiveness
    anti_armor = Column(Integer, default=0)          # 0-100
    anti_infantry = Column(Integer, default=0)       # 0-100
    anti_air = Column(Integer, default=0)            # 0-100
    survivability = Column(Integer, default=50)      # 0-100, damage resistance
    mobility = Column(Integer, default=3)            # 1-5
    cost_usd = Column(Integer, nullable=False)
    upkeep_per_mission = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class OwnedGroundUnit(Base):
    __tablename__ = "owned_ground_units"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    ground_unit_id = Column(Integer, ForeignKey("ground_units.id"), nullable=False)
    custom_name = Column(String, nullable=True)   # e.g. "Alpha-1"
    hp_pct = Column(Float, default=100.0)         # 0-100, permanent tracking
    battles_fought = Column(Integer, default=0)
    kills = Column(Integer, default=0)
    acquired_at = Column(DateTime(timezone=True), server_default=func.now())
    user = relationship("User")
    unit = relationship("GroundUnit")
