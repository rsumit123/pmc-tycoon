import json
from sqlalchemy.orm import Session
from app.models.subsystem import SubsystemModule, AircraftSubsystem
from app.models.aircraft import Aircraft
from app.models.owned_aircraft import OwnedAircraft


# Aircraft default subsystem specs keyed by aircraft name
AIRCRAFT_DEFAULTS = {
    "Dassault Rafale": {
        "origin": "France",
        "radar": {"radar_type": "RBE2 AESA", "radar_range_km": 150, "irst": True},
        "engine": {"thrust_to_weight_mod": 1.13, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "SPECTRA", "ecm_rating": 85},
        "countermeasures": {"chaff_count": 112, "flare_count": 32, "towed_decoy": False},
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 1.0, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "F-16C Block 52": {
        "origin": "USA",
        "radar": {"radar_type": "APG-68(V)9", "radar_range_km": 120, "irst": False},
        "engine": {"thrust_to_weight_mod": 1.095, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "ALQ-211 AIDEWS", "ecm_rating": 65},
        "countermeasures": {"chaff_count": 90, "flare_count": 30, "towed_decoy": False},
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 3.5, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "Su-30MKI": {
        "origin": "Russia/India",
        "radar": {"radar_type": "N011M BARS PESA", "radar_range_km": 180, "irst": True},
        "engine": {"thrust_to_weight_mod": 1.0, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "Tarang Mk2", "ecm_rating": 60},
        "countermeasures": {"chaff_count": 96, "flare_count": 48, "towed_decoy": False},
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 10.0, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "F-15E Strike Eagle": {
        "origin": "USA",
        "radar": {"radar_type": "APG-82(V)1 AESA", "radar_range_km": 180, "irst": False},
        "engine": {"thrust_to_weight_mod": 1.12, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "TEWS", "ecm_rating": 70},
        "countermeasures": {"chaff_count": 120, "flare_count": 60, "towed_decoy": False},
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 10.0, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "JF-17 Thunder": {
        "origin": "Pakistan/China",
        "radar": {"radar_type": "KLJ-7A AESA", "radar_range_km": 130, "irst": False},
        "engine": {"thrust_to_weight_mod": 0.95, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "Basic ECM", "ecm_rating": 40},
        "countermeasures": {"chaff_count": 64, "flare_count": 24, "towed_decoy": False},
        "airframe": {"max_g_mod": 8.5, "rcs_mod": 3.0, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "Tejas Mk2": {
        "origin": "India",
        "radar": {"radar_type": "Uttam AESA", "radar_range_km": 150, "irst": True},
        "engine": {"thrust_to_weight_mod": 1.07, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "Mayavi", "ecm_rating": 70},
        "countermeasures": {"chaff_count": 80, "flare_count": 32, "towed_decoy": False},
        "airframe": {"max_g_mod": 8.0, "rcs_mod": 1.5, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "Mirage 2000-5": {
        "origin": "France",
        "radar": {"radar_type": "RDY-2", "radar_range_km": 130, "irst": False},
        "engine": {"thrust_to_weight_mod": 1.05, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "ICMS Mk3", "ecm_rating": 60},
        "countermeasures": {"chaff_count": 96, "flare_count": 32, "towed_decoy": False},
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 1.5, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "Eurofighter Typhoon": {
        "origin": "Europe",
        "radar": {"radar_type": "Captor-E AESA", "radar_range_km": 200, "irst": True},
        "engine": {"thrust_to_weight_mod": 1.18, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "Praetorian DASS", "ecm_rating": 88},
        "countermeasures": {"chaff_count": 120, "flare_count": 48, "towed_decoy": False},
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 0.5, "payload_mod": 1.0, "hp_mod": 1.0},
    },
}

# Upgrade modules (not defaults, universal compatibility)
UPGRADE_MODULES = [
    # --- RADAR upgrades ---
    {
        "name": "APG-83 SABR",
        "slot_type": "radar",
        "tier": 2,
        "origin": "USA",
        "description": "Scalable Agile Beam Radar — AESA upgrade derived from F-35's APG-81.",
        "stats": json.dumps({"radar_type": "APG-83 SABR AESA", "radar_range_km": 160, "irst": False}),
        "cost": 12000,
        "maintenance_cost": 400,
        "is_default": False,
    },
    {
        "name": "AN/APG-82(V)1+",
        "slot_type": "radar",
        "tier": 3,
        "origin": "USA",
        "description": "Enhanced AESA radar with improved track-while-scan and ECCM capabilities.",
        "stats": json.dumps({"radar_type": "APG-82(V)1+ AESA", "radar_range_km": 200, "irst": False}),
        "cost": 25000,
        "maintenance_cost": 800,
        "is_default": False,
    },
    {
        "name": "Zhuk-AE AESA",
        "slot_type": "radar",
        "tier": 2,
        "origin": "Russia",
        "description": "Phazotron AESA radar with excellent multi-target tracking.",
        "stats": json.dumps({"radar_type": "Zhuk-AE AESA", "radar_range_km": 150, "irst": False}),
        "cost": 10000,
        "maintenance_cost": 350,
        "is_default": False,
    },
    {
        "name": "Captor-E Mk2",
        "slot_type": "radar",
        "tier": 3,
        "origin": "Europe",
        "description": "Next-gen wide-angle AESA with repositioner for extreme off-boresight detection.",
        "stats": json.dumps({"radar_type": "Captor-E Mk2 AESA", "radar_range_km": 220, "irst": True}),
        "cost": 30000,
        "maintenance_cost": 900,
        "is_default": False,
    },
    # --- ENGINE upgrades ---
    {
        "name": "Enhanced F110-GE-132",
        "slot_type": "engine",
        "tier": 2,
        "origin": "USA",
        "description": "Upgraded turbofan with improved thrust and fuel efficiency.",
        "stats": json.dumps({"thrust_to_weight_mod": 1.18, "fuel_efficiency_mod": 1.05, "max_speed_mod": 1.02}),
        "cost": 15000,
        "maintenance_cost": 500,
        "is_default": False,
    },
    {
        "name": "F135 Derivative",
        "slot_type": "engine",
        "tier": 3,
        "origin": "USA",
        "description": "Adapted from F-35 powerplant — massive thrust with adaptive cycle technology.",
        "stats": json.dumps({"thrust_to_weight_mod": 1.25, "fuel_efficiency_mod": 1.10, "max_speed_mod": 1.05}),
        "cost": 35000,
        "maintenance_cost": 1000,
        "is_default": False,
    },
    {
        "name": "AL-41F1S Upgraded",
        "slot_type": "engine",
        "tier": 2,
        "origin": "Russia",
        "description": "Saturn turbofan with thrust vectoring and improved high-altitude performance.",
        "stats": json.dumps({"thrust_to_weight_mod": 1.15, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.03}),
        "cost": 12000,
        "maintenance_cost": 450,
        "is_default": False,
    },
    {
        "name": "EJ200 Phase 3",
        "slot_type": "engine",
        "tier": 3,
        "origin": "Europe",
        "description": "Enhanced EuroJet with increased core temperature and supercruise capability.",
        "stats": json.dumps({"thrust_to_weight_mod": 1.22, "fuel_efficiency_mod": 1.08, "max_speed_mod": 1.06}),
        "cost": 30000,
        "maintenance_cost": 850,
        "is_default": False,
    },
    # --- ECM upgrades ---
    {
        "name": "Khibiny-M",
        "slot_type": "ecm",
        "tier": 2,
        "origin": "Russia",
        "description": "Advanced electronic countermeasures pod with wideband jamming.",
        "stats": json.dumps({"ecm_suite": "Khibiny-M", "ecm_rating": 75}),
        "cost": 10000,
        "maintenance_cost": 300,
        "is_default": False,
    },
    {
        "name": "SPECTRA-NG",
        "slot_type": "ecm",
        "tier": 3,
        "origin": "France",
        "description": "Next-gen SPECTRA with cognitive EW and AI-driven threat response.",
        "stats": json.dumps({"ecm_suite": "SPECTRA-NG", "ecm_rating": 95}),
        "cost": 28000,
        "maintenance_cost": 750,
        "is_default": False,
    },
    {
        "name": "ALQ-239 DEWS",
        "slot_type": "ecm",
        "tier": 2,
        "origin": "USA",
        "description": "Digital Electronic Warfare System with real-time threat adaptation.",
        "stats": json.dumps({"ecm_suite": "ALQ-239 DEWS", "ecm_rating": 78}),
        "cost": 14000,
        "maintenance_cost": 400,
        "is_default": False,
    },
    # --- COUNTERMEASURES upgrades ---
    {
        "name": "Enhanced Dispenser System",
        "slot_type": "countermeasures",
        "tier": 2,
        "origin": "International",
        "description": "High-capacity chaff/flare dispenser with programmable release patterns.",
        "stats": json.dumps({"chaff_count": 150, "flare_count": 60, "towed_decoy": False}),
        "cost": 5000,
        "maintenance_cost": 150,
        "is_default": False,
    },
    {
        "name": "Next-Gen CMS",
        "slot_type": "countermeasures",
        "tier": 3,
        "origin": "International",
        "description": "Next-generation countermeasure suite with BOL dispensers and towed decoy.",
        "stats": json.dumps({"chaff_count": 200, "flare_count": 80, "towed_decoy": True}),
        "cost": 15000,
        "maintenance_cost": 400,
        "is_default": False,
    },
    {
        "name": "BriteCloud Decoy System",
        "slot_type": "countermeasures",
        "tier": 2,
        "origin": "UK",
        "description": "Expendable active decoy system that mimics aircraft radar signature.",
        "stats": json.dumps({"chaff_count": 120, "flare_count": 50, "towed_decoy": True}),
        "cost": 8000,
        "maintenance_cost": 250,
        "is_default": False,
    },
    # --- COMPUTER upgrades ---
    {
        "name": "AESA-Integrated FCC",
        "slot_type": "computer",
        "tier": 2,
        "origin": "USA",
        "description": "Fire control computer with tight AESA integration for improved kill probability.",
        "stats": json.dumps({"pk_bonus": 0.05, "scan_speed_mod": 1.15, "multi_target": 4}),
        "cost": 8000,
        "maintenance_cost": 200,
        "is_default": False,
    },
    {
        "name": "Sensor Fusion MMC",
        "slot_type": "computer",
        "tier": 3,
        "origin": "USA",
        "description": "AI-driven mission computer fusing radar, IRST, EW and datalink for total SA.",
        "stats": json.dumps({"pk_bonus": 0.10, "scan_speed_mod": 1.30, "multi_target": 8}),
        "cost": 22000,
        "maintenance_cost": 600,
        "is_default": False,
    },
    {
        "name": "Digital Glass Cockpit MMC",
        "slot_type": "computer",
        "tier": 2,
        "origin": "Europe",
        "description": "Modern mission computer with enhanced symbology and automated target prioritization.",
        "stats": json.dumps({"pk_bonus": 0.03, "scan_speed_mod": 1.10, "multi_target": 3}),
        "cost": 6000,
        "maintenance_cost": 150,
        "is_default": False,
    },
    # --- AIRFRAME upgrades ---
    {
        "name": "Reinforced Airframe",
        "slot_type": "airframe",
        "tier": 2,
        "origin": "International",
        "description": "Structural reinforcement package — increased durability at slight weight penalty.",
        "stats": json.dumps({"max_g_mod": 9.5, "rcs_mod": 1.0, "payload_mod": 1.1, "hp_mod": 1.2}),
        "cost": 10000,
        "maintenance_cost": 300,
        "is_default": False,
    },
    {
        "name": "Stealth Coating Package",
        "slot_type": "airframe",
        "tier": 2,
        "origin": "USA",
        "description": "Radar-absorbent material coating that significantly reduces RCS.",
        "stats": json.dumps({"max_g_mod": 9.0, "rcs_mod": 0.5, "payload_mod": 1.0, "hp_mod": 1.0}),
        "cost": 18000,
        "maintenance_cost": 600,
        "is_default": False,
    },
    {
        "name": "Composite Overhaul",
        "slot_type": "airframe",
        "tier": 3,
        "origin": "International",
        "description": "Full carbon-fiber composite replacement — lighter, stronger, stealthier.",
        "stats": json.dumps({"max_g_mod": 10.0, "rcs_mod": 0.6, "payload_mod": 1.15, "hp_mod": 1.3}),
        "cost": 32000,
        "maintenance_cost": 900,
        "is_default": False,
    },
]


def seed_subsystems(db: Session) -> None:
    """Seed subsystem modules and install defaults on owned aircraft."""

    # Skip if already seeded
    existing = db.query(SubsystemModule).first()
    if existing:
        return

    # Build a lookup: aircraft name -> aircraft ID
    all_aircraft = db.query(Aircraft).all()
    ac_by_name = {ac.name: ac.id for ac in all_aircraft}

    # --- Create default modules for each aircraft ---
    # We'll track them so we can install them on owned aircraft later
    # Key: (aircraft_name, slot_type) -> SubsystemModule
    default_module_map = {}

    for ac_name, specs in AIRCRAFT_DEFAULTS.items():
        ac_id = ac_by_name.get(ac_name)
        if ac_id is None:
            continue

        compatible = json.dumps([ac_id])
        origin = specs["origin"]

        # RADAR
        mod = SubsystemModule(
            name=f"{specs['radar']['radar_type']} ({ac_name})",
            slot_type="radar",
            tier=1,
            origin=origin,
            description=f"Stock radar unit for {ac_name}.",
            stats=json.dumps(specs["radar"]),
            cost=0,
            maintenance_cost=200,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "radar")] = mod

        # ENGINE
        mod = SubsystemModule(
            name=f"Standard Engine ({ac_name})",
            slot_type="engine",
            tier=1,
            origin=origin,
            description=f"Stock powerplant for {ac_name}.",
            stats=json.dumps(specs["engine"]),
            cost=0,
            maintenance_cost=300,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "engine")] = mod

        # ECM
        mod = SubsystemModule(
            name=f"{specs['ecm']['ecm_suite']} ({ac_name})",
            slot_type="ecm",
            tier=1,
            origin=origin,
            description=f"Stock electronic warfare suite for {ac_name}.",
            stats=json.dumps(specs["ecm"]),
            cost=0,
            maintenance_cost=150,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "ecm")] = mod

        # COUNTERMEASURES
        mod = SubsystemModule(
            name=f"Standard CMS ({ac_name})",
            slot_type="countermeasures",
            tier=1,
            origin=origin,
            description=f"Stock countermeasure dispenser for {ac_name}.",
            stats=json.dumps(specs["countermeasures"]),
            cost=0,
            maintenance_cost=100,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "countermeasures")] = mod

        # COMPUTER (standard for all)
        mod = SubsystemModule(
            name=f"Standard MMC ({ac_name})",
            slot_type="computer",
            tier=1,
            origin=origin,
            description=f"Stock mission management computer for {ac_name}.",
            stats=json.dumps({"pk_bonus": 0.0, "scan_speed_mod": 1.0, "multi_target": 2}),
            cost=0,
            maintenance_cost=100,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "computer")] = mod

        # AIRFRAME
        mod = SubsystemModule(
            name=f"Standard Airframe ({ac_name})",
            slot_type="airframe",
            tier=1,
            origin=origin,
            description=f"Stock airframe for {ac_name}.",
            stats=json.dumps(specs["airframe"]),
            cost=0,
            maintenance_cost=200,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "airframe")] = mod

    # --- Create upgrade modules (universal) ---
    for upg in UPGRADE_MODULES:
        mod = SubsystemModule(**upg)
        db.add(mod)

    # Flush so all modules get IDs
    db.flush()

    # --- Install default subsystems on every owned aircraft ---
    owned_list = db.query(OwnedAircraft).all()
    for owned in owned_list:
        aircraft = db.query(Aircraft).filter(Aircraft.id == owned.aircraft_id).first()
        if not aircraft or aircraft.name not in AIRCRAFT_DEFAULTS:
            continue

        for slot in ("radar", "engine", "ecm", "countermeasures", "computer", "airframe"):
            default_mod = default_module_map.get((aircraft.name, slot))
            if default_mod is None:
                continue
            sub = AircraftSubsystem(
                owned_aircraft_id=owned.id,
                slot_type=slot,
                module_id=default_mod.id,
                condition_pct=100,
            )
            db.add(sub)

    db.commit()
