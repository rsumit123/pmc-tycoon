from sqlalchemy.orm import Session
from app.models.ground_unit import GroundUnit

GROUND_UNITS = [
    # INFANTRY
    {"name": "Rifle Squad", "unit_type": "infantry", "role": "General Infantry",
     "description": "8-man squad with assault rifles. Cheap, versatile, excels in urban terrain.",
     "origin": "Universal", "image_url": None,
     "combat_power": 15, "anti_armor": 5, "anti_infantry": 70, "anti_air": 10,
     "survivability": 30, "mobility": 5, "cost_usd": 8000, "upkeep_per_mission": 500},
    {"name": "RPG Team", "unit_type": "rpg_team", "role": "Anti-Armor",
     "description": "2-man team with RPG-7. Lethal against light armor and fortifications.",
     "origin": "Universal", "image_url": None,
     "combat_power": 20, "anti_armor": 75, "anti_infantry": 35, "anti_air": 5,
     "survivability": 25, "mobility": 5, "cost_usd": 12000, "upkeep_per_mission": 800},
    {"name": "Sniper Team", "unit_type": "sniper", "role": "Precision Fire",
     "description": ".338 Lapua 2-man team. Suppresses enemy infantry, eliminates HVTs.",
     "origin": "Universal", "image_url": None,
     "combat_power": 18, "anti_armor": 5, "anti_infantry": 85, "anti_air": 0,
     "survivability": 40, "mobility": 4, "cost_usd": 18000, "upkeep_per_mission": 1000},
    {"name": "MANPADS Team", "unit_type": "manpads", "role": "Anti-Air Defense",
     "description": "FIM-92 Stinger team. Neutralizes drones, helicopters, low-altitude threats.",
     "origin": "Universal", "image_url": None,
     "combat_power": 12, "anti_armor": 0, "anti_infantry": 10, "anti_air": 90,
     "survivability": 25, "mobility": 5, "cost_usd": 25000, "upkeep_per_mission": 1500},
    {"name": "Special Forces Team", "unit_type": "spec_ops", "role": "Deep Infiltration",
     "description": "6-man SF team. Sabotages enemy logistics, disrupts artillery before main assault.",
     "origin": "Universal", "image_url": None,
     "combat_power": 30, "anti_armor": 20, "anti_infantry": 80, "anti_air": 15,
     "survivability": 55, "mobility": 5, "cost_usd": 150000, "upkeep_per_mission": 8000},
    # ARMOR
    {"name": "BMP-3 IFV", "unit_type": "ifv", "role": "Infantry Support",
     "description": "Russian IFV with 100mm gun + 30mm cannon. Carries infantry, supports assault.",
     "origin": "Russia",
     "image_url": "https://upload.wikimedia.org/wikipedia/commons/4/47/BMP-3_-_2017_%28Cropped%29.jpg",
     "combat_power": 40, "anti_armor": 45, "anti_infantry": 75, "anti_air": 20,
     "survivability": 55, "mobility": 4, "cost_usd": 120000, "upkeep_per_mission": 5000},
    {"name": "T-72B3", "unit_type": "light_tank", "role": "Mobile Armor",
     "description": "Upgraded T-72 as fast flanking element. High mobility, lighter armor than MBTs.",
     "origin": "Russia",
     "image_url": "https://upload.wikimedia.org/wikipedia/commons/0/0c/T-72B3_tank_%282018%29.jpg",
     "combat_power": 50, "anti_armor": 65, "anti_infantry": 55, "anti_air": 5,
     "survivability": 60, "mobility": 4, "cost_usd": 180000, "upkeep_per_mission": 8000},
    {"name": "T-90A MBT", "unit_type": "mbt", "role": "Main Battle Tank",
     "description": "Russian 3rd-gen MBT with Kontakt-5 ERA. 125mm cannon. Backbone of armored warfare.",
     "origin": "Russia",
     "image_url": "https://upload.wikimedia.org/wikipedia/commons/5/5a/T-90A_main_battle_tank_of_the_Russian_Ground_Forces.jpg",
     "combat_power": 70, "anti_armor": 80, "anti_infantry": 60, "anti_air": 5,
     "survivability": 80, "mobility": 3, "cost_usd": 450000, "upkeep_per_mission": 15000},
    {"name": "M1A2 Abrams", "unit_type": "mbt", "role": "Heavy Assault",
     "description": "US premium MBT with Chobham armor and 120mm M256. Highest survivability in class.",
     "origin": "USA",
     "image_url": "https://upload.wikimedia.org/wikipedia/commons/0/01/M1A2_Abrams_at_the_Pentagon.jpg",
     "combat_power": 80, "anti_armor": 85, "anti_infantry": 65, "anti_air": 5,
     "survivability": 88, "mobility": 3, "cost_usd": 650000, "upkeep_per_mission": 20000},
    {"name": "9M133 Kornet ATGM", "unit_type": "tank_destroyer", "role": "Anti-Armor",
     "description": "Vehicle-mounted Kornet. Penetrates 1200mm RHA. Kills any MBT. Low survivability.",
     "origin": "Russia", "image_url": None,
     "combat_power": 35, "anti_armor": 90, "anti_infantry": 20, "anti_air": 5,
     "survivability": 35, "mobility": 4, "cost_usd": 90000, "upkeep_per_mission": 4000},
    # ARTILLERY
    {"name": "M120 Mortar Team", "unit_type": "mortar", "role": "Direct Fire Support",
     "description": "120mm heavy mortar. Portable indirect fire, effective against infantry and light vehicles.",
     "origin": "USA", "image_url": None,
     "combat_power": 22, "anti_armor": 20, "anti_infantry": 75, "anti_air": 0,
     "survivability": 25, "mobility": 3, "cost_usd": 25000, "upkeep_per_mission": 1500},
    {"name": "M109A6 Paladin", "unit_type": "sph", "role": "Self-Propelled Artillery",
     "description": "155mm tracked howitzer. Shoot-and-scoot, 30km range, GPS-guided rounds.",
     "origin": "USA",
     "image_url": "https://upload.wikimedia.org/wikipedia/commons/e/e3/M109_Paladin_howitzer.jpg",
     "combat_power": 55, "anti_armor": 50, "anti_infantry": 85, "anti_air": 0,
     "survivability": 45, "mobility": 3, "cost_usd": 280000, "upkeep_per_mission": 12000},
    {"name": "BM-21 Grad MLRS", "unit_type": "mlrs", "role": "Area Denial",
     "description": "40-tube 122mm rocket artillery. Saturates large areas. Ideal vs massed infantry.",
     "origin": "Russia",
     "image_url": "https://upload.wikimedia.org/wikipedia/commons/5/5e/BM-21-Grad-launcher.jpg",
     "combat_power": 60, "anti_armor": 35, "anti_infantry": 90, "anti_air": 0,
     "survivability": 40, "mobility": 4, "cost_usd": 220000, "upkeep_per_mission": 10000},
    # DRONES
    {"name": "Bayraktar TB2 ISR", "unit_type": "drone_isr", "role": "Intelligence & Targeting",
     "description": "MALE drone with EO/IR turret. Designates targets for artillery, reveals enemy in real-time.",
     "origin": "Turkey",
     "image_url": "https://upload.wikimedia.org/wikipedia/commons/5/5d/Bayraktar_TB2_of_the_Ukrainian_Air_Force.jpg",
     "combat_power": 10, "anti_armor": 0, "anti_infantry": 0, "anti_air": 0,
     "survivability": 20, "mobility": 5, "cost_usd": 90000, "upkeep_per_mission": 3000},
    {"name": "Bayraktar TB2 Attack", "unit_type": "drone_attack", "role": "Precision Strike",
     "description": "TB2 with MAM-L smart munitions. Hunts armor and artillery from 25km standoff.",
     "origin": "Turkey",
     "image_url": "https://upload.wikimedia.org/wikipedia/commons/5/5d/Bayraktar_TB2_of_the_Ukrainian_Air_Force.jpg",
     "combat_power": 55, "anti_armor": 75, "anti_infantry": 50, "anti_air": 0,
     "survivability": 20, "mobility": 5, "cost_usd": 320000, "upkeep_per_mission": 10000},
]


def seed_ground_units(db: Session) -> None:
    """Seed ground unit templates if not present."""
    existing = db.query(GroundUnit).count()
    if existing > 0:
        return
    for u in GROUND_UNITS:
        db.add(GroundUnit(**u))
    db.commit()
    print(f"Seeded {len(GROUND_UNITS)} ground units.")
