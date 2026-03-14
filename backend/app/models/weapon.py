from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Enum
from sqlalchemy.sql import func
import enum
from app.db.base import Base


class WeaponType(str, enum.Enum):
    BVR_AAM = "BVR_AAM"
    IR_AAM = "IR_AAM"
    ASM = "ASM"
    SAM = "SAM"
    CIWS = "CIWS"
    GUN = "GUN"


class Weapon(Base):
    __tablename__ = "weapons"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    origin = Column(String, nullable=False)
    weapon_type = Column(Enum(WeaponType), nullable=False)
    weight_kg = Column(Integer, nullable=False)

    # Kinematics
    max_range_km = Column(Integer, nullable=False)
    no_escape_range_km = Column(Integer, default=0)
    min_range_km = Column(Integer, default=0)
    speed_mach = Column(Float, nullable=False)

    # Guidance
    guidance = Column(String, nullable=False)  # "active_radar", "semi_active_radar", "IR", "inertial+active_radar"
    seeker_generation = Column(Integer, default=3)  # 1-5, higher = harder to jam

    # Lethality
    base_pk = Column(Float, nullable=False)  # 0.0-1.0
    warhead_kg = Column(Integer, nullable=False)

    # Countermeasure resistance
    eccm_rating = Column(Integer, default=50)  # 0-100
    maneuverability_g = Column(Integer, default=20)  # terminal maneuver G

    # Game meta
    image_url = Column(String, nullable=True)  # Photo URL for UI
    cost_per_unit = Column(Integer, nullable=False)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
