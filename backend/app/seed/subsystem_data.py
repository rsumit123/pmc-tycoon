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
        "engine_name": "M88-2",
        "engine": {"thrust_to_weight_mod": 1.13, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "SPECTRA", "ecm_rating": 85},
        "cm_name": "MBDA Chaff/Flare Dispenser",
        "countermeasures": {"chaff_count": 112, "flare_count": 32, "towed_decoy": False},
        "computer_name": "MDPU Mission Computer",
        "airframe_name": "Composite Delta Wing",
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 1.0, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "F-16C Block 52": {
        "origin": "USA",
        "radar": {"radar_type": "APG-68(V)9", "radar_range_km": 120, "irst": False},
        "engine_name": "F110-GE-129",
        "engine": {"thrust_to_weight_mod": 1.095, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "ALQ-211 AIDEWS", "ecm_rating": 65},
        "cm_name": "AN/ALE-47 CMDS",
        "countermeasures": {"chaff_count": 90, "flare_count": 30, "towed_decoy": False},
        "computer_name": "MMC Block 52",
        "airframe_name": "Lightweight Alloy Monoplane",
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 3.5, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "Su-30MKI": {
        "origin": "Russia/India",
        "radar": {"radar_type": "N011M BARS PESA", "radar_range_km": 180, "irst": True},
        "engine_name": "AL-31FP",
        "engine": {"thrust_to_weight_mod": 1.0, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "Tarang Mk2", "ecm_rating": 60},
        "cm_name": "APP-50 Dispenser",
        "countermeasures": {"chaff_count": 96, "flare_count": 48, "towed_decoy": False},
        "computer_name": "MIL-STD-1553B Bus",
        "airframe_name": "Titanium/Aluminium Twin-Tail",
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 10.0, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "F-15E Strike Eagle": {
        "origin": "USA",
        "radar": {"radar_type": "APG-82(V)1 AESA", "radar_range_km": 180, "irst": False},
        "engine_name": "F100-PW-229",
        "engine": {"thrust_to_weight_mod": 1.12, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "TEWS", "ecm_rating": 70},
        "cm_name": "AN/ALE-45 CMDS",
        "countermeasures": {"chaff_count": 120, "flare_count": 60, "towed_decoy": False},
        "computer_name": "ADCP-II Mission Computer",
        "airframe_name": "Heavy-Duty Strike Airframe",
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 10.0, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "JF-17 Thunder": {
        "origin": "Pakistan/China",
        "radar": {"radar_type": "KLJ-7A AESA", "radar_range_km": 130, "irst": False},
        "engine_name": "RD-93",
        "engine": {"thrust_to_weight_mod": 0.95, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "Basic ECM", "ecm_rating": 40},
        "cm_name": "Standard Dispenser",
        "countermeasures": {"chaff_count": 64, "flare_count": 24, "towed_decoy": False},
        "computer_name": "NRIET Avionics",
        "airframe_name": "Lightweight Single-Engine",
        "airframe": {"max_g_mod": 8.5, "rcs_mod": 3.0, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "Tejas Mk2": {
        "origin": "India",
        "radar": {"radar_type": "Uttam AESA", "radar_range_km": 150, "irst": True},
        "engine_name": "GE F414-INS6",
        "engine": {"thrust_to_weight_mod": 1.07, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "Mayavi", "ecm_rating": 70},
        "cm_name": "DRDO CMDS",
        "countermeasures": {"chaff_count": 80, "flare_count": 32, "towed_decoy": False},
        "computer_name": "DFCC Mk2",
        "airframe_name": "Composite Tailless Delta",
        "airframe": {"max_g_mod": 8.0, "rcs_mod": 1.5, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "Mirage 2000-5": {
        "origin": "France",
        "radar": {"radar_type": "RDY-2", "radar_range_km": 130, "irst": False},
        "engine_name": "M53-P2",
        "engine": {"thrust_to_weight_mod": 1.05, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "ICMS Mk3", "ecm_rating": 60},
        "cm_name": "Spirale CMDS",
        "countermeasures": {"chaff_count": 96, "flare_count": 32, "towed_decoy": False},
        "computer_name": "Thales Avionics Suite",
        "airframe_name": "Delta Wing Monocoque",
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 1.5, "payload_mod": 1.0, "hp_mod": 1.0},
    },
    "Eurofighter Typhoon": {
        "origin": "Europe",
        "radar": {"radar_type": "Captor-E AESA", "radar_range_km": 200, "irst": True},
        "engine_name": "EJ200",
        "engine": {"thrust_to_weight_mod": 1.18, "fuel_efficiency_mod": 1.0, "max_speed_mod": 1.0},
        "ecm": {"ecm_suite": "Praetorian DASS", "ecm_rating": 88},
        "cm_name": "BOL/BOP Dispenser",
        "countermeasures": {"chaff_count": 120, "flare_count": 48, "towed_decoy": False},
        "computer_name": "DASS Attack Computer",
        "airframe_name": "Canard-Delta CFRP",
        "airframe": {"max_g_mod": 9.0, "rcs_mod": 0.5, "payload_mod": 1.0, "hp_mod": 1.0},
    },
}

# Default image URLs per slot type (from Wikimedia Commons, verified)
SLOT_IMAGES = {
    "radar": [
        "https://upload.wikimedia.org/wikipedia/commons/d/d3/AN-APG-68_radar%2C_Westinghouse%2C_1978_-_National_Electronics_Museum_-_DSC00415.JPG",
        "https://upload.wikimedia.org/wikipedia/commons/4/4b/APY-016K_AESA_radar_in_Compact_Antenna_Test_Range.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/5/5e/AAAU_of_DRDO_Uttam_AESA_radar.png",
        "https://upload.wikimedia.org/wikipedia/commons/b/b6/96L6E_phased_array_radar_antenna.JPG",
    ],
    "engine": [
        "https://upload.wikimedia.org/wikipedia/commons/3/39/Close_up_of_a_General_Electric_F110_engine_on_a_F-14_Tomcat_2009-12-27.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/f/f7/General_Electric_F110_AEDC_84-1128_USAF.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/a/af/Pratt_%26_Whitney_F135_at_the_Steven_F._Udvar-Hazy_Center%2C_Dec_2017_1.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/6/63/EJ200-Eurofighter-Turbine-apel.JPG",
        "https://upload.wikimedia.org/wikipedia/commons/2/27/117C_for_Su-35.jpg",
    ],
    "ecm": [
        "https://upload.wikimedia.org/wikipedia/commons/a/ab/ALQ-131_ECM_Pod.JPG",
        "https://upload.wikimedia.org/wikipedia/commons/9/9d/AN_ALQ-131%28V%29_mounted_on_USAF_F-16_at_ILA-2024.JPG",
        "https://upload.wikimedia.org/wikipedia/commons/4/48/Two_airmen_inspect_an_electronic_countermeasures_pod.jpg",
    ],
    "countermeasures": [
        "https://upload.wikimedia.org/wikipedia/commons/8/81/F-14_Chaff-Flare_Load.JPEG",
        "https://upload.wikimedia.org/wikipedia/commons/5/51/C-130_Hercules_flare_and_CHAFF_dispensers.JPEG",
        "https://upload.wikimedia.org/wikipedia/commons/f/f4/F-15E_Strike_Eagles_launch_chaff_and_flares.jpg",
    ],
    "computer": [
        "https://upload.wikimedia.org/wikipedia/commons/5/51/F16_Cockpit%2C_Asian_Aerospace_2006.JPG",
        "https://upload.wikimedia.org/wikipedia/commons/9/97/F-16_Cockpit_part.JPG",
        "https://upload.wikimedia.org/wikipedia/commons/a/ac/NAVSTA_Rota_tries_out_F-35_cockpit_demonstrator_%285529922%29.jpg",
    ],
    "airframe": [
        "https://upload.wikimedia.org/wikipedia/commons/b/b6/F-22_Raptor.JPG",
        "https://upload.wikimedia.org/wikipedia/commons/0/04/Fond_Farewell_to_F-15C_A5095_%288605963%29.jpg",
        "https://upload.wikimedia.org/wikipedia/commons/5/5c/F-22_Raptor_-_100526-F-2185F-524.JPG",
    ],
}

# Per-module image overrides (index into SLOT_IMAGES[slot_type])
MODULE_IMAGE_INDEX = {
    # Radars
    "APG-68(V)9": 0, "RBE2 AESA": 1, "N011M BARS PESA": 3, "APG-82(V)1 AESA": 1,
    "KLJ-7A AESA": 1, "Uttam AESA": 2, "RDY-2": 3, "Captor-E AESA": 1,
    "APG-83 SABR": 1, "Zhuk-AE AESA": 3, "AN/APG-82(V)1+": 1, "Captor-E Mk2": 1,
    # Engines
    "F110-GE-129": 0, "M88-2": 1, "AL-31FP": 4, "F100-PW-229": 1,
    "RD-93": 0, "GE F414-INS6": 0, "M53-P2": 1, "EJ200": 3,
    "Enhanced F110-GE-132": 1, "F135 Derivative": 2, "AL-41F1S Upgraded": 4, "EJ200 Phase 3": 3,
    # ECM
    "SPECTRA": 2, "ALQ-211 AIDEWS": 1, "Tarang Mk2": 2, "TEWS": 0,
    "Basic ECM": 1, "Mayavi": 2, "ICMS Mk3": 0, "Praetorian DASS": 2,
    "Khibiny-M": 2, "SPECTRA-NG": 2, "ALQ-239 DEWS": 0,
    # Countermeasures
    "AN/ALE-47 CMDS": 0, "APP-50 Dispenser": 0, "AN/ALE-45 CMDS": 0,
    "Spirale CMDS": 1, "BOL/BOP Dispenser": 2, "DRDO CMDS": 0, "MBDA Chaff/Flare Dispenser": 0,
    "Standard Dispenser": 0,
    "Enhanced Dispenser System": 1, "Next-Gen CMS": 2, "BriteCloud Decoy System": 2,
    # Computers
    "AESA-Integrated FCC": 1, "Sensor Fusion MMC": 2, "Digital Glass Cockpit MMC": 2,
    # Airframes
    "Reinforced Airframe": 1, "Stealth Coating Package": 2, "Composite Overhaul": 0,
}


def _get_module_image(slot_type: str, module_name: str) -> str | None:
    """Get image URL for a module based on its name or slot type."""
    images = SLOT_IMAGES.get(slot_type, [])
    if not images:
        return None
    # Check for specific module match
    for key, idx in MODULE_IMAGE_INDEX.items():
        if key in module_name:
            return images[idx % len(images)] if idx < len(images) else images[0]
    # Fallback: first image for slot type
    return images[0]


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
        radar_name = specs['radar']['radar_type']
        mod = SubsystemModule(
            name=f"{radar_name} ({ac_name})",
            slot_type="radar",
            tier=1,
            origin=origin,
            description=f"Stock radar unit for {ac_name}.",
            stats=json.dumps(specs["radar"]),
            image_url=_get_module_image("radar", radar_name),
            cost=0,
            maintenance_cost=200,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "radar")] = mod

        # ENGINE
        engine_name = specs.get("engine_name", "Standard Engine")
        mod = SubsystemModule(
            name=f"{engine_name} ({ac_name})",
            slot_type="engine",
            tier=1,
            origin=origin,
            description=f"Stock {engine_name} powerplant for {ac_name}.",
            stats=json.dumps(specs["engine"]),
            image_url=_get_module_image("engine", engine_name),
            cost=0,
            maintenance_cost=300,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "engine")] = mod

        # ECM
        ecm_name = specs['ecm']['ecm_suite']
        mod = SubsystemModule(
            name=f"{ecm_name} ({ac_name})",
            slot_type="ecm",
            tier=1,
            origin=origin,
            description=f"Stock electronic warfare suite for {ac_name}.",
            stats=json.dumps(specs["ecm"]),
            image_url=_get_module_image("ecm", ecm_name),
            cost=0,
            maintenance_cost=150,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "ecm")] = mod

        # COUNTERMEASURES
        cm_name = specs.get("cm_name", "Standard CMS")
        mod = SubsystemModule(
            name=f"{cm_name} ({ac_name})",
            slot_type="countermeasures",
            tier=1,
            origin=origin,
            description=f"Stock {cm_name} for {ac_name}.",
            stats=json.dumps(specs["countermeasures"]),
            image_url=_get_module_image("countermeasures", cm_name),
            cost=0,
            maintenance_cost=100,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "countermeasures")] = mod

        # COMPUTER
        computer_name = specs.get("computer_name", "Standard MMC")
        mod = SubsystemModule(
            name=f"{computer_name} ({ac_name})",
            slot_type="computer",
            tier=1,
            origin=origin,
            description=f"Stock {computer_name} for {ac_name}.",
            stats=json.dumps({"pk_bonus": 0.0, "scan_speed_mod": 1.0, "multi_target": 2}),
            image_url=_get_module_image("computer", computer_name),
            cost=0,
            maintenance_cost=100,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "computer")] = mod

        # AIRFRAME
        airframe_name = specs.get("airframe_name", "Standard Airframe")
        mod = SubsystemModule(
            name=f"{airframe_name} ({ac_name})",
            slot_type="airframe",
            tier=1,
            origin=origin,
            description=f"Stock {airframe_name} structure for {ac_name}.",
            stats=json.dumps(specs["airframe"]),
            image_url=_get_module_image("airframe", airframe_name),
            cost=0,
            maintenance_cost=200,
            compatible_aircraft=compatible,
            is_default=True,
        )
        db.add(mod)
        default_module_map[(ac_name, "airframe")] = mod

    # --- Create upgrade modules (universal) ---
    for upg in UPGRADE_MODULES:
        upg_copy = dict(upg)
        if "image_url" not in upg_copy:
            upg_copy["image_url"] = _get_module_image(upg_copy["slot_type"], upg_copy["name"])
        mod = SubsystemModule(**upg_copy)
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
