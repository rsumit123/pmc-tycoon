from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class SubsystemModule(Base):
    __tablename__ = "subsystem_modules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    slot_type = Column(String, nullable=False)  # "radar", "engine", "ecm", "countermeasures", "computer", "airframe"
    tier = Column(Integer, default=1)  # 1-3
    origin = Column(String, nullable=False)
    description = Column(String, nullable=True)

    # Stats as JSON - different per slot type
    # radar: {radar_type, radar_range_km, irst}
    # engine: {thrust_to_weight_mod, fuel_efficiency_mod, max_speed_mod}
    # ecm: {ecm_suite, ecm_rating}
    # countermeasures: {chaff_count, flare_count, towed_decoy}
    # computer: {pk_bonus, scan_speed_mod, multi_target}
    # airframe: {max_g_mod, rcs_mod, payload_mod, hp_mod}
    stats = Column(String, nullable=False)  # JSON

    image_url = Column(String, nullable=True)
    cost = Column(Integer, default=0)
    maintenance_cost = Column(Integer, default=0)  # per mission repair cost base
    compatible_aircraft = Column(String, nullable=True)  # JSON list of aircraft IDs, null = universal
    requires_research_id = Column(Integer, nullable=True)  # FK to future research table

    is_default = Column(Boolean, default=False)  # True = comes installed on aircraft by default
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AircraftSubsystem(Base):
    __tablename__ = "aircraft_subsystems"

    id = Column(Integer, primary_key=True, index=True)
    owned_aircraft_id = Column(Integer, ForeignKey("owned_aircraft.id"), nullable=False)
    slot_type = Column(String, nullable=False)  # same enum as above
    module_id = Column(Integer, ForeignKey("subsystem_modules.id"), nullable=False)
    condition_pct = Column(Integer, default=100)  # 0-100

    installed_at = Column(DateTime(timezone=True), server_default=func.now())

    owned_aircraft = relationship("OwnedAircraft")
    module = relationship("SubsystemModule")
