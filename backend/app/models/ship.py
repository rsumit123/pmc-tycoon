from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Enum
from sqlalchemy.sql import func
import enum
from app.db.base import Base


class ShipType(str, enum.Enum):
    DESTROYER = "destroyer"
    FRIGATE = "frigate"
    CORVETTE = "corvette"
    CRUISER = "cruiser"
    CARRIER = "carrier"


class Ship(Base):
    __tablename__ = "ships"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    class_name = Column(String, nullable=False)
    origin = Column(String, nullable=False)
    ship_type = Column(Enum(ShipType), nullable=False)
    image_silhouette = Column(String, nullable=True)
    image_url = Column(String, nullable=True)  # Photo URL for UI

    # Specs
    displacement_tons = Column(Integer, nullable=False)
    max_speed_knots = Column(Integer, nullable=False)
    crew = Column(Integer, nullable=False)

    # Sensors
    radar_type = Column(String, nullable=False)
    radar_range_km = Column(Integer, nullable=False)
    sonar = Column(String, nullable=True)
    helicopter = Column(String, nullable=True)

    # Weapon systems (JSON strings of [{weapon_id, count}])
    anti_ship_missiles = Column(String, nullable=True)
    sam_systems = Column(String, nullable=True)
    ciws = Column(String, nullable=True)
    torpedoes = Column(String, nullable=True)
    gun = Column(String, nullable=True)

    # Defense
    ecm_suite = Column(String, nullable=True)
    ecm_rating = Column(Integer, default=0)
    decoys = Column(String, nullable=True)
    compartments = Column(Integer, default=10)  # damage resilience

    # Game meta
    unlock_cost = Column(Integer, nullable=False)
    maintenance_cost = Column(Integer, nullable=False)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
