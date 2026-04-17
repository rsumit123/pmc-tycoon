"""Unit tests for LLM enrichment — verifies correct event queries."""
import pytest
from sqlalchemy.orm import Session

from app.models.campaign import Campaign
from app.models.event import CampaignEvent
from app.models.vignette import Vignette
from app.crud.campaign import create_campaign
from app.schemas.campaign import CampaignCreate


def _create_test_campaign(db: Session, name: str = "test_campaign", seed: int = 42) -> Campaign:
    """Helper to create a test campaign without seeding starting state."""
    payload = CampaignCreate(
        name=name,
        difficulty="realistic",
        objectives=["maintain_42_squadrons"],
        seed=seed,
    )
    campaign = create_campaign(db, payload)
    db.commit()
    return campaign


def test_year_recap_enrichment_queries_events(db: Session):
    """Verify delivery events can be queried for year-recap enrichment."""
    campaign = _create_test_campaign(db, "campaign_1", seed=42)

    # Add a delivery event
    db.add(CampaignEvent(
        campaign_id=campaign.id,
        year=2026, quarter=3,
        event_type="delivery_complete",
        payload={"platform_id": "rafale_f4", "quantity": 6},
    ))
    db.commit()

    # Verify we can query it
    events = db.query(CampaignEvent).filter_by(
        campaign_id=campaign.id,
    ).filter(CampaignEvent.year == 2026).all()
    assert len(events) >= 1
    delivery = [e for e in events if e.event_type == "delivery_complete"]
    assert len(delivery) == 1
    assert delivery[0].payload["platform_id"] == "rafale_f4"
    assert delivery[0].payload["quantity"] == 6


def test_retrospective_enrichment_all_years(db: Session):
    """Verify R&D milestone events can be queried across multiple years."""
    campaign = _create_test_campaign(db, "campaign_2", seed=43)

    for y in range(2026, 2030):
        db.add(CampaignEvent(
            campaign_id=campaign.id,
            year=y, quarter=2,
            event_type="rd_milestone",
            payload={"program_id": "amca_mk1", "milestone": f"milestone_{y}"},
        ))
    db.commit()

    # Verify we can query all milestones
    events = db.query(CampaignEvent).filter_by(campaign_id=campaign.id).all()
    milestones = [e for e in events if e.event_type == "rd_milestone"]
    assert len(milestones) == 4
    assert all(m.payload["program_id"] == "amca_mk1" for m in milestones)


def test_vignette_enrichment_win_loss(db: Session):
    """Verify vignette win/loss outcomes can be queried for retrospective enrichment."""
    campaign = _create_test_campaign(db, "campaign_3", seed=44)

    # Add vignettes with different outcomes
    v1 = Vignette(
        campaign_id=campaign.id,
        year=2027, quarter=1,
        scenario_id="lac_air_incursion_limited",
        status="resolved",
        outcome={"objective_met": True, "ind_kia": 1, "adv_kia": 3},
    )
    v2 = Vignette(
        campaign_id=campaign.id,
        year=2027, quarter=3,
        scenario_id="paf_stealth_probe",
        status="resolved",
        outcome={"objective_met": False, "ind_kia": 4, "adv_kia": 1},
    )
    db.add_all([v1, v2])
    db.commit()

    # Verify we can query wins and losses separately
    vigs = db.query(Vignette).filter_by(campaign_id=campaign.id, status="resolved").all()
    wins = [v for v in vigs if v.outcome and v.outcome.get("objective_met")]
    losses = [v for v in vigs if v.outcome and not v.outcome.get("objective_met")]

    assert len(wins) == 1
    assert len(losses) == 1
    assert wins[0].outcome["adv_kia"] == 3
    assert losses[0].outcome["ind_kia"] == 4


def test_event_query_by_type(db: Session):
    """Verify events can be queried by type for narrative generation."""
    campaign = _create_test_campaign(db, "campaign_4", seed=45)

    # Add various event types
    db.add(CampaignEvent(
        campaign_id=campaign.id,
        year=2027, quarter=1,
        event_type="acquisition_start",
        payload={"platform_id": "tejas_mk2", "quantity": 8},
    ))
    db.add(CampaignEvent(
        campaign_id=campaign.id,
        year=2027, quarter=1,
        event_type="rd_start",
        payload={"program_id": "tedbf"},
    ))
    db.commit()

    # Query by event type
    acquisitions = db.query(CampaignEvent).filter_by(
        campaign_id=campaign.id,
        event_type="acquisition_start",
    ).all()
    rd_starts = db.query(CampaignEvent).filter_by(
        campaign_id=campaign.id,
        event_type="rd_start",
    ).all()

    assert len(acquisitions) == 1
    assert len(rd_starts) == 1
    assert acquisitions[0].payload["platform_id"] == "tejas_mk2"
    assert rd_starts[0].payload["program_id"] == "tedbf"


def test_vignette_ace_enrichment(db: Session):
    """Verify vignettes with ace data can be queried."""
    campaign = _create_test_campaign(db, "campaign_5", seed=46)

    v = Vignette(
        campaign_id=campaign.id,
        year=2028, quarter=2,
        scenario_id="lac_heavy_escalation",
        status="resolved",
        outcome={"objective_met": True, "ind_kia": 2, "adv_kia": 7},
        event_trace=[
            {"type": "ace_kill", "platform": "rafale_f4", "call_sign": "Kestrel-1"}
        ],
    )
    db.add(v)
    db.commit()

    # Verify we can query the vignette and access its event trace
    vig = db.query(Vignette).filter_by(
        campaign_id=campaign.id,
        scenario_id="lac_heavy_escalation",
    ).first()
    assert vig is not None
    assert vig.outcome["objective_met"] is True
    assert len(vig.event_trace) == 1
    assert vig.event_trace[0]["call_sign"] == "Kestrel-1"


def test_campaign_event_payload_structure(db: Session):
    """Verify campaign event payloads are correctly persisted and retrieved."""
    campaign = _create_test_campaign(db, "campaign_6", seed=47)

    payload = {
        "program_id": "amca_mk1",
        "invested_so_far_cr": 45000,
        "milestone": "detailed_design_review",
        "next_milestone": "flight_test_readiness",
    }
    db.add(CampaignEvent(
        campaign_id=campaign.id,
        year=2029, quarter=1,
        event_type="rd_milestone",
        payload=payload,
    ))
    db.commit()

    # Verify payload is correctly stored and retrieved
    event = db.query(CampaignEvent).filter_by(
        campaign_id=campaign.id,
        event_type="rd_milestone",
    ).first()
    assert event is not None
    assert event.payload == payload
    assert event.payload["invested_so_far_cr"] == 45000
    assert event.payload["milestone"] == "detailed_design_review"
