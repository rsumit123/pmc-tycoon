"""Seed the campaign with the historically-grounded 2026-Q2 starting state.

Per docs/content/platforms-seed-2026.md, the player inherits:
  - 3 air bases (Ambala, Hasimara, Jodhpur)
  - 3 named seed squadrons (Plan 10 expands to the full 31-sqn force)
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


SEED_BASES = [
    {"template_id": "ambala", "shelter_count": 24, "fuel_depot_size": 3,
     "ad_integration_level": 2, "runway_class": "heavy"},
    {"template_id": "hasimara", "shelter_count": 18, "fuel_depot_size": 2,
     "ad_integration_level": 2, "runway_class": "heavy"},
    {"template_id": "jodhpur", "shelter_count": 20, "fuel_depot_size": 3,
     "ad_integration_level": 2, "runway_class": "heavy"},
]

SEED_SQUADRONS = [
    # (name, call_sign, platform_id, base_template_id, strength, readiness)
    ("17 Sqn Golden Arrows", "GA", "rafale_f4", "ambala", 18, 82),
    ("101 Sqn Falcons", "FALCON", "rafale_f4", "hasimara", 18, 78),
    ("32 Sqn Thunderbirds", "TB", "su30_mki", "jodhpur", 18, 75),
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
