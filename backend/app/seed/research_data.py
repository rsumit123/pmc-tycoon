from sqlalchemy.orm import Session
from app.models.research import ResearchItem


# Research tree definition
# Each entry: (name, description, branch, tier, cost_rp, cost_money, duration_hours, prerequisite_name, unlocks_module_name)
RESEARCH_TREE = [
    # ─── SENSORS ───
    ("Radar Optimization", "Foundational radar theory and calibration techniques.", "sensors", 1, 80, 5000, 2, None, None),
    ("AESA Integration", "Integrate western AESA radar technology into your fleet.", "sensors", 2, 150, 12000, 4, "Radar Optimization", "APG-83 SABR"),
    ("Eastern Radar Systems", "Study and adapt eastern-bloc radar designs.", "sensors", 2, 120, 10000, 3, "Radar Optimization", "Zhuk-AE AESA"),
    ("Next-Gen Radar", "Push radar performance to the cutting edge.", "sensors", 3, 250, 25000, 8, "AESA Integration", "AN/APG-82(V)1+"),
    ("Wide-Angle AESA", "Develop wide-angle electronically scanned arrays.", "sensors", 3, 280, 30000, 8, "AESA Integration", "Captor-E Mk2"),

    # ─── PROPULSION ───
    ("Engine Efficiency", "Core turbofan theory and thermodynamic optimization.", "propulsion", 1, 80, 5000, 2, None, None),
    ("Western Powerplant Upgrade", "Unlock western high-performance engine upgrades.", "propulsion", 2, 140, 15000, 4, "Engine Efficiency", "Enhanced F110-GE-132"),
    ("Eastern Powerplant Upgrade", "Adapt eastern thrust-vectoring powerplant technology.", "propulsion", 2, 120, 12000, 3, "Engine Efficiency", "AL-41F1S Upgraded"),
    ("Adaptive Cycle Engine", "Master next-generation adaptive cycle engine technology.", "propulsion", 3, 300, 35000, 10, "Western Powerplant Upgrade", "F135 Derivative"),
    ("Supercruise Enhancement", "Achieve sustained supersonic cruise without afterburner.", "propulsion", 3, 260, 30000, 8, "Western Powerplant Upgrade", "EJ200 Phase 3"),

    # ─── ELECTRONIC WARFARE ───
    ("ECM Fundamentals", "Electronic countermeasure theory and signal processing.", "ew", 1, 80, 5000, 2, None, None),
    ("Russian EW Systems", "Reverse-engineer and integrate Russian EW suites.", "ew", 2, 120, 10000, 3, "ECM Fundamentals", "Khibiny-M"),
    ("Digital EW Suite", "Develop a fully digital electronic warfare platform.", "ew", 2, 140, 14000, 4, "ECM Fundamentals", "ALQ-239 DEWS"),
    ("Cognitive EW", "AI-driven threat recognition and autonomous jamming.", "ew", 3, 250, 28000, 8, "Digital EW Suite", "SPECTRA-NG"),

    # ─── STRUCTURES ───
    ("Structural Analysis", "Advanced materials science and airframe stress modeling.", "structures", 1, 80, 5000, 2, None, None),
    ("Airframe Reinforcement", "Reinforce airframes for higher G-tolerance and payload.", "structures", 2, 120, 10000, 3, "Structural Analysis", "Reinforced Airframe"),
    ("RAM Coating", "Apply radar-absorbent material coatings for stealth.", "structures", 2, 160, 18000, 5, "Structural Analysis", "Stealth Coating Package"),
    ("Advanced Composites", "Full carbon-fiber composite structural overhaul.", "structures", 3, 280, 32000, 8, "Airframe Reinforcement", "Composite Overhaul"),
    ("Active Decoy Systems", "Expendable active decoys that mimic aircraft signatures.", "structures", 2, 100, 8000, 3, "Structural Analysis", "BriteCloud Decoy System"),
    ("Enhanced Dispensers", "High-capacity programmable chaff/flare dispensers.", "structures", 2, 80, 5000, 2, "Structural Analysis", "Enhanced Dispenser System"),
    ("Next-Gen Countermeasures", "Combine BOL dispensers with towed decoy capability.", "structures", 3, 160, 15000, 5, "Enhanced Dispensers", "Next-Gen CMS"),

    # ─── WEAPONS INTEGRATION ───
    ("Fire Control Basics", "Fire control computer theory and weapon bus architecture.", "weapons", 1, 80, 5000, 2, None, None),
    ("AESA-FCC Integration", "Tight coupling between AESA radar and fire control.", "weapons", 2, 100, 8000, 3, "Fire Control Basics", "AESA-Integrated FCC"),
    ("Glass Cockpit Upgrade", "Modern digital cockpit with automated target prioritization.", "weapons", 2, 80, 6000, 2, "Fire Control Basics", "Digital Glass Cockpit MMC"),
    ("Sensor Fusion", "AI-driven fusion of radar, IRST, EW and datalink.", "weapons", 3, 220, 22000, 8, "AESA-FCC Integration", "Sensor Fusion MMC"),
]


def seed_research(db: Session) -> None:
    """Seed research items. Skips if already seeded."""
    existing = db.query(ResearchItem).first()
    if existing:
        return

    # First pass: create all items without prerequisite links
    name_to_item = {}
    for (name, desc, branch, tier, cost_rp, cost_money, duration, prereq_name, unlocks) in RESEARCH_TREE:
        item = ResearchItem(
            name=name,
            description=desc,
            branch=branch,
            tier=tier,
            cost_rp=cost_rp,
            cost_money=cost_money,
            duration_hours=duration,
            unlocks_module_name=unlocks,
        )
        db.add(item)
        name_to_item[name] = item

    # Flush to get IDs
    db.flush()

    # Second pass: set prerequisite IDs
    for (name, desc, branch, tier, cost_rp, cost_money, duration, prereq_name, unlocks) in RESEARCH_TREE:
        if prereq_name and prereq_name in name_to_item:
            name_to_item[name].prerequisite_id = name_to_item[prereq_name].id

    db.commit()
