from sqlalchemy.orm import Session
from app.db.session import SessionLocal, engine
from app.db.base import Base
from app.models.unit import BaseUnitTemplate, OwnedUnit
from app.models.contractor import ContractorTemplate, OwnedContractor
from app.models.contract import MissionTemplate, ActiveContract, MissionLog, Faction
from app.models.user import User
from app.models.aircraft import Aircraft
from app.models.weapon import Weapon
from app.models.ship import Ship
from app.models.battle import Battle, BattlePhase
from app.models.owned_aircraft import OwnedAircraft
from app.models.owned_ship import OwnedShip
from app.models.owned_weapon import OwnedWeapon
from app.seed.hardware_data import seed_hardware
from app.models.subsystem import SubsystemModule, AircraftSubsystem
from app.seed.subsystem_data import seed_subsystems
from app.models.research import ResearchItem, UserResearch
from app.seed.research_data import seed_research

def init_db(db: Session) -> None:
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    # Create base unit templates if they don't exist
    unit_templates = [
        {
            "name": "F-16 Fighting Falcon",
            "unit_type": "fighter",
            "base_cost": 50000,
            "base_maintenance_cost": 2000,
            "base_attack": 80,
            "base_defense": 60,
            "base_speed": 90,
            "base_range": 70,
            "description": "Versatile multirole fighter jet"
        },
        {
            "name": "MQ-9 Reaper Drone",
            "unit_type": "drone",
            "base_cost": 30000,
            "base_maintenance_cost": 500,
            "base_attack": 60,
            "base_defense": 40,
            "base_speed": 50,
            "base_range": 90,
            "description": "Unmanned combat aerial vehicle"
        },
        {
            "name": "Ohio-class Submarine",
            "unit_type": "submarine",
            "base_cost": 200000,
            "base_maintenance_cost": 15000,
            "base_attack": 95,
            "base_defense": 85,
            "base_speed": 40,
            "base_range": 100,
            "description": "Nuclear-powered ballistic missile submarine"
        }
    ]
    
    for template_data in unit_templates:
        existing = db.query(BaseUnitTemplate).filter(BaseUnitTemplate.name == template_data["name"]).first()
        if not existing:
            template = BaseUnitTemplate(**template_data)
            db.add(template)
    
    # Create contractor templates if they don't exist
    contractor_templates = [
        {
            "name": "Ace Pilot",
            "specialization": "pilot",
            "base_skill": 80,
            "base_salary": 5000,
            "description": "Experienced fighter jet pilot"
        },
        {
            "name": "Drone Operator",
            "specialization": "operator",
            "base_skill": 70,
            "base_salary": 3000,
            "description": "Skilled unmanned aerial vehicle operator"
        },
        {
            "name": "Submarine Commander",
            "specialization": "operator",
            "base_skill": 85,
            "base_salary": 8000,
            "description": "Veteran submarine warfare officer"
        },
        {
            "name": "Avionics Technician",
            "specialization": "technician",
            "base_skill": 75,
            "base_salary": 4000,
            "description": "Aircraft electronics systems specialist"
        }
    ]
    
    for template_data in contractor_templates:
        existing = db.query(ContractorTemplate).filter(ContractorTemplate.name == template_data["name"]).first()
        if not existing:
            template = ContractorTemplate(**template_data)
            db.add(template)
    
    # Legacy mission templates removed — all missions now use the battle system
    # Battle-type missions are seeded in seed/hardware_data.py
    
    # Create a default user if none exists
    default_user = db.query(User).filter(User.username == "commander").first()
    if not default_user:
        # In a real app, we would hash the password
        default_user = User(
            username="commander",
            email="commander@pmctycoon.com",
            hashed_password="hashed_password_placeholder",  # This is just for initialization
            balance=250000,
            reputation=50,
            tech_level=1
        )
        db.add(default_user)
        db.commit()
        db.refresh(default_user)
    
    # Give the user some starting units if they don't have any
    existing_units = db.query(OwnedUnit).filter(OwnedUnit.user_id == default_user.id).count()
    if existing_units == 0:
        starting_units = [
            {
                "user_id": default_user.id,
                "template_id": 1,  # F-16 Fighting Falcon
                "condition": 85,
                "current_upgrades": '["Advanced Radar"]',
                "maintenance_cost_multiplier": 1.0
            },
            {
                "user_id": default_user.id,
                "template_id": 2,  # MQ-9 Reaper Drone
                "condition": 92,
                "current_upgrades": '["Night Vision"]',
                "maintenance_cost_multiplier": 1.0
            },
            {
                "user_id": default_user.id,
                "template_id": 3,  # Ohio-class Submarine
                "condition": 78,
                "current_upgrades": '["Silent Propulsion"]',
                "maintenance_cost_multiplier": 1.0
            }
        ]
        
        for unit_data in starting_units:
            unit = OwnedUnit(**unit_data)
            db.add(unit)
    
    # Give the user some starting contractors if they don't have any
    existing_contractors = db.query(OwnedContractor).filter(OwnedContractor.user_id == default_user.id).count()
    if existing_contractors == 0:
        starting_contractors = [
            {
                "user_id": default_user.id,
                "template_id": 1,  # Ace Pilot
                "skill_level": 80,
                "fatigue_level": 0,
                "current_salary": 5000
            },
            {
                "user_id": default_user.id,
                "template_id": 2,  # Drone Operator
                "skill_level": 70,
                "fatigue_level": 0,
                "current_salary": 3000
            },
            {
                "user_id": default_user.id,
                "template_id": 3,  # Submarine Commander
                "skill_level": 85,
                "fatigue_level": 0,
                "current_salary": 8000
            }
        ]
        
        for contractor_data in starting_contractors:
            contractor = OwnedContractor(**contractor_data)
            db.add(contractor)
    
    db.commit()

    # Seed real military hardware (aircraft, weapons, ships)
    seed_hardware(db)
    print("Hardware data seeded.")

    # Seed subsystem modules and install defaults on owned aircraft
    seed_subsystems(db)
    print("Subsystem data seeded.")

    # Seed research tech tree
    seed_research(db)
    print("Research data seeded.")

if __name__ == "__main__":
    db = SessionLocal()
    init_db(db)
    print("Database initialized with sample data!")