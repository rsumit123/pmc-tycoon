from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.sql import func
from app.db.base import Base


class Aircraft(Base):
    __tablename__ = "aircraft"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    origin = Column(String, nullable=False)
    role = Column(String, nullable=False)  # multirole, air_superiority, interceptor, strike
    generation = Column(String, nullable=False)  # "4", "4.5", "5"
    image_silhouette = Column(String, nullable=True)

    # Performance
    max_speed_mach = Column(Float, nullable=False)
    max_speed_loaded_mach = Column(Float, nullable=False)
    combat_radius_km = Column(Integer, nullable=False)
    service_ceiling_ft = Column(Integer, nullable=False)

    # Maneuverability
    max_g_load = Column(Float, nullable=False)
    thrust_to_weight_clean = Column(Float, nullable=False)
    wing_loading_kg_m2 = Column(Integer, nullable=False)
    instantaneous_turn_rate_deg_s = Column(Integer, nullable=False)
    sustained_turn_rate_deg_s = Column(Integer, nullable=False)

    # Payload & Fuel
    empty_weight_kg = Column(Integer, nullable=False)
    max_takeoff_weight_kg = Column(Integer, nullable=False)
    internal_fuel_kg = Column(Integer, nullable=False)
    max_payload_kg = Column(Integer, nullable=False)
    hardpoints = Column(Integer, nullable=False)
    compatible_weapons = Column(String, nullable=False)  # JSON list of weapon IDs

    # Sensors
    radar_type = Column(String, nullable=False)
    radar_range_km = Column(Integer, nullable=False)
    rcs_m2 = Column(Float, nullable=False)
    irst = Column(Boolean, default=False)

    # Electronic Warfare
    ecm_suite = Column(String, nullable=True)
    ecm_rating = Column(Integer, default=0)  # 0-100
    chaff_count = Column(Integer, default=0)
    flare_count = Column(Integer, default=0)
    towed_decoy = Column(Boolean, default=False)

    # Game meta
    unlock_cost = Column(Integer, nullable=False)
    maintenance_cost = Column(Integer, nullable=False)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
