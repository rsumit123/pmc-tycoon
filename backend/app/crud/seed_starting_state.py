"""Seed the campaign with the historically-grounded 2026-Q2 starting state.

Per docs/content/platforms-seed-2026.md, the player inherits:
  - 15 air bases (Ambala, Hasimara, Jodhpur, + 12 more)
  - 31 named seed squadrons (IAF 2026 force vs authorized 42)
  - MRFA Rafale F4 acquisition (114, 2026-Q1 .. 2032-Q1)
  - Tejas Mk1A acquisition (97, 2025-Q3 .. 2030-Q4)
  - AMCA Mk1 + AMCA engine R&D — active, 0% progress
  - Astra Mk2 R&D — 75% (series production due 2026-Q3)
  - Tejas Mk2 R&D — 10%
"""

from sqlalchemy.orm import Session

from app.models.campaign import Campaign
from app.models.campaign_base import CampaignBase
from app.models.squadron import Squadron
from app.models.acquisition import AcquisitionOrder
from app.models.rd_program import RDProgramState
from app.models.adversary import AdversaryState
from app.models.intel import IntelCard
from app.models.ad_battery import ADBattery
from app.engine.adversary.state import OOB_2026_Q2


SEED_BASES = [
    {"template_id": "ambala", "shelter_count": 24, "fuel_depot_size": 3,
     "ad_integration_level": 2, "runway_class": "heavy"},
    {"template_id": "hasimara", "shelter_count": 20, "fuel_depot_size": 2,
     "ad_integration_level": 2, "runway_class": "heavy"},
    {"template_id": "jodhpur", "shelter_count": 22, "fuel_depot_size": 3,
     "ad_integration_level": 2, "runway_class": "heavy"},
    {"template_id": "adampur", "shelter_count": 20, "fuel_depot_size": 2,
     "ad_integration_level": 1, "runway_class": "heavy"},
    {"template_id": "halwara", "shelter_count": 22, "fuel_depot_size": 3,
     "ad_integration_level": 2, "runway_class": "heavy"},
    {"template_id": "pathankot", "shelter_count": 18, "fuel_depot_size": 2,
     "ad_integration_level": 1, "runway_class": "heavy"},
    {"template_id": "srinagar", "shelter_count": 14, "fuel_depot_size": 2,
     "ad_integration_level": 2, "runway_class": "medium"},
    {"template_id": "bareilly", "shelter_count": 24, "fuel_depot_size": 3,
     "ad_integration_level": 1, "runway_class": "heavy"},
    {"template_id": "gwalior", "shelter_count": 20, "fuel_depot_size": 2,
     "ad_integration_level": 1, "runway_class": "heavy"},
    {"template_id": "pune", "shelter_count": 22, "fuel_depot_size": 3,
     "ad_integration_level": 1, "runway_class": "heavy"},
    {"template_id": "thanjavur", "shelter_count": 20, "fuel_depot_size": 2,
     "ad_integration_level": 1, "runway_class": "heavy"},
    {"template_id": "tezpur", "shelter_count": 18, "fuel_depot_size": 2,
     "ad_integration_level": 2, "runway_class": "heavy"},
    {"template_id": "chabua", "shelter_count": 18, "fuel_depot_size": 2,
     "ad_integration_level": 1, "runway_class": "heavy"},
    {"template_id": "car_nicobar", "shelter_count": 12, "fuel_depot_size": 1,
     "ad_integration_level": 1, "runway_class": "medium"},
    {"template_id": "nal", "shelter_count": 16, "fuel_depot_size": 2,
     "ad_integration_level": 1, "runway_class": "heavy"},
]

SEED_SQUADRONS = [
    # (name, call_sign, platform_id, base_template_id, airframes, readiness_pct)
    # Ambala — 3 squadrons
    ("17 Sqn Golden Arrows", "GOLDEN", "rafale_f4", "ambala", 18, 82),
    ("14 Sqn Bulls", "BULL", "jaguar_darin3", "ambala", 16, 70),
    ("4 Sqn Oorials", "OORIAL", "mig21_bison", "ambala", 14, 62),
    # Hasimara — 2 squadrons
    ("101 Sqn Falcons", "FALCON", "rafale_f4", "hasimara", 18, 78),
    ("16 Sqn Cobras", "COBRA", "jaguar_darin3", "hasimara", 16, 69),
    # Jodhpur — 3 squadrons
    ("32 Sqn Thunderbirds", "THUNDER", "su30_mki", "jodhpur", 18, 75),
    ("30 Sqn Rhinos", "RHINO", "su30_mki", "jodhpur", 18, 73),
    ("29 Sqn Scorpions", "SCORPION", "mig29_upg", "jodhpur", 16, 72),
    # Adampur — 2 squadrons
    ("28 Sqn First Supersonics", "SONIC", "mig29_upg", "adampur", 16, 74),
    ("26 Sqn Warriors", "WARRIOR", "su30_mki", "adampur", 18, 76),
    # Halwara — 2 squadrons
    ("220 Sqn Desert Tigers", "DTIGER", "su30_mki", "halwara", 18, 74),
    ("5 Sqn Tuskers", "TUSKER", "jaguar_darin3", "halwara", 16, 68),
    # Pathankot — 2 squadrons
    ("23 Sqn Panthers", "PANTHER", "su30_mki", "pathankot", 18, 73),
    ("6 Sqn Dragons", "DRAGON", "jaguar_darin3", "pathankot", 16, 69),
    # Srinagar — 1 squadron
    ("47 Sqn Black Archers", "ARCHER", "mig29_upg", "srinagar", 16, 71),
    # Bareilly — 3 squadrons
    ("24 Sqn Hawks", "HAWK", "su30_mki", "bareilly", 18, 77),
    ("8 Sqn Pursoots", "PURSOOT", "su30_mki", "bareilly", 18, 76),
    ("1 Sqn Tigers", "TIGER", "mirage2000", "bareilly", 16, 74),
    # Gwalior — 2 squadrons
    ("7 Sqn Battleaxes", "AXE", "mirage2000", "gwalior", 16, 73),
    ("9 Sqn Wolfpack", "WOLF", "mirage2000", "gwalior", 16, 72),
    # Pune — 2 squadrons
    ("15 Sqn Flying Lancers", "LANCER", "su30_mki", "pune", 18, 76),
    ("20 Sqn Lightnings", "LIGHTNING", "su30_mki", "pune", 18, 75),
    # Thanjavur — 2 squadrons
    ("222 Sqn Tigersharks", "TSHARK", "su30_mki", "thanjavur", 18, 77),
    ("45 Sqn Flying Daggers", "DAGGER", "tejas_mk1", "thanjavur", 16, 80),
    # Tezpur — 2 squadrons
    ("31 Sqn Lions", "LION", "su30_mki", "tezpur", 18, 74),
    ("27 Sqn Flaming Arrows", "FLAME", "jaguar_darin3", "tezpur", 16, 67),
    # Chabua — 2 squadrons
    ("102 Sqn Trisonics", "TRISONIC", "su30_mki", "chabua", 18, 73),
    ("18 Sqn Flying Bullets", "BULLET", "tejas_mk1", "chabua", 16, 79),
    # Car Nicobar — 1 squadron
    ("21 Sqn Ankush", "ANKUSH", "su30_mki", "car_nicobar", 18, 72),
    # Nal — 2 squadrons
    ("51 Sqn Swordarms", "SWORD", "mig21_bison", "nal", 14, 60),
    ("87 Sqn Falcons of Nal", "NALCON", "tejas_mk1a", "nal", 16, 83),
    # AWACS — Netra AEW&C at Bareilly (western coverage) + Nal (desert coverage)
    ("50 Sqn Stallions", "STALLION", "netra_aewc", "bareilly", 3, 78),
    ("25 Sqn Himalayan Eagles", "AWACS-W", "netra_aewc", "nal", 3, 75),
    # Tanker — IL-78MKI at Ambala
    ("78 Sqn Tuskers", "TANKER", "il78_tanker", "ambala", 6, 72),
]

SEED_ACQUISITIONS = [
    {
        "platform_id": "rafale_f4", "quantity": 114,
        "signed_year": 2026, "signed_quarter": 1,
        "first_delivery_year": 2027, "first_delivery_quarter": 4,
        "foc_year": 2032, "foc_quarter": 1,
        "delivered": 0, "total_cost_cr": 514000,  # ~₹4500 cr/jet * 114
    },
    {
        "platform_id": "tejas_mk1a", "quantity": 97,
        "signed_year": 2025, "signed_quarter": 3,
        "first_delivery_year": 2026, "first_delivery_quarter": 1,
        "foc_year": 2030, "foc_quarter": 4,
        "delivered": 0, "total_cost_cr": 48500,  # ~₹500 cr/jet * 97
    },
]

SEED_AD_BATTERIES = [
    # (system_id, base_template_id, coverage_km, installed_year, installed_quarter)
    # Long-range: S-400 at two hubs. IRL 2026 state: 3 of 5 squadrons delivered —
    # 322 Sqn Pathankot (west/PLAAF+PAF), 323 Sqn Kheria (central/UP), 324 Sqn
    # covering east. Pathankot + Bareilly approximates west + central layering.
    ("s400", "pathankot", 150, 2026, 2),
    ("s400", "bareilly", 150, 2026, 2),
    # Medium-range Akash-NG at 3 theater-facing bases (west / east / south).
    ("akash_ng", "ambala", 70, 2026, 2),
    ("akash_ng", "adampur", 70, 2026, 2),
    ("akash_ng", "thanjavur", 70, 2026, 2),
    # Point-defense QRSAM at 3 forward / high-value bases.
    ("qrsam", "srinagar", 30, 2026, 2),
    ("qrsam", "tezpur", 30, 2026, 2),
    ("qrsam", "jodhpur", 30, 2026, 2),
    # VSHORADS as last-ditch baseline at 5 major bases.
    ("vshorads", "pathankot", 8, 2026, 2),
    ("vshorads", "ambala", 8, 2026, 2),
    ("vshorads", "gwalior", 8, 2026, 2),
    ("vshorads", "hasimara", 8, 2026, 2),
    ("vshorads", "bareilly", 8, 2026, 2),
]

SEED_RD_PROGRAMS = [
    {"program_id": "amca_mk1", "progress_pct": 0, "funding_level": "standard"},
    {"program_id": "amca_mk1_engine", "progress_pct": 0, "funding_level": "standard"},
    {"program_id": "astra_mk2", "progress_pct": 75, "funding_level": "standard"},
    {"program_id": "tejas_mk2", "progress_pct": 10, "funding_level": "standard"},
]


def seed_starting_state(db: Session, campaign: Campaign) -> None:
    bases_by_template: dict[str, CampaignBase] = {}
    for b in SEED_BASES:
        row = CampaignBase(campaign_id=campaign.id, **b)
        db.add(row)
        bases_by_template[b["template_id"]] = row
    db.flush()  # populate row.id

    for sys_id, base_tpl, cov, inst_year, inst_qtr in SEED_AD_BATTERIES:
        base_row = bases_by_template.get(base_tpl)
        if base_row is None:
            continue
        db.add(ADBattery(
            campaign_id=campaign.id,
            base_id=base_row.id,
            system_id=sys_id,
            coverage_km=cov,
            installed_year=inst_year,
            installed_quarter=inst_qtr,
        ))

    for name, call_sign, platform_id, base_tpl, strength, readiness in SEED_SQUADRONS:
        db.add(Squadron(
            campaign_id=campaign.id,
            name=name,
            call_sign=call_sign,
            platform_id=platform_id,
            base_id=bases_by_template[base_tpl].id,
            strength=strength,
            readiness_pct=readiness,
            xp=0,
        ))

    for ao in SEED_ACQUISITIONS:
        db.add(AcquisitionOrder(campaign_id=campaign.id, **ao))

    for prog in SEED_RD_PROGRAMS:
        db.add(RDProgramState(
            campaign_id=campaign.id,
            program_id=prog["program_id"],
            progress_pct=prog["progress_pct"],
            funding_level=prog["funding_level"],
            status="active",
            milestones_hit=[],
            cost_invested_cr=0,
            quarters_active=0,
        ))

    for faction, state in OOB_2026_Q2.items():
        db.add(AdversaryState(
            campaign_id=campaign.id,
            faction=faction,
            state=dict(state),  # shallow copy of the module-level constant
        ))

    # Pre-seed the PAF J-35E deal as a Turn-0 visible intel card.
    db.add(IntelCard(
        campaign_id=campaign.id,
        appeared_year=campaign.current_year,
        appeared_quarter=campaign.current_quarter,
        source_type="IMINT",
        confidence=0.94,
        truth_value=True,
        payload={
            "headline": "Pakistan finalizes J-35E deal — 40 airframes + 30 option",
            "template_id": "__turn0_seed__",
            "subject_faction": "PAF",
            "subject_type": "deployment_observation",
            "observed": {"jets_contracted": 40, "option": 30, "first_delivery_q": "2026-Q3"},
            "ground_truth": {"jets_contracted": 40, "option": 30, "first_delivery_q": "2026-Q3"},
        },
    ))
