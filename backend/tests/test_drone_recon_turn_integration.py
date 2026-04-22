"""Integration test: advance_turn emits drone_recon IntelCards when a
friendly ISR drone squadron is present + in range of adversary bases.
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.schemas.campaign import CampaignCreate
from app.crud.campaign import create_campaign, advance_turn
from app.models.intel import IntelCard
from app.models.squadron import Squadron
from app.models.campaign_base import CampaignBase
from app.models.adversary_base import AdversaryBase
from app.content.registry import bases as _bases_catalog


def _memory_db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def test_advance_turn_emits_drone_recon_when_mq9b_present():
    SessionLocal = _memory_db()
    db = SessionLocal()
    campaign = create_campaign(
        db, CampaignCreate(name="T", difficulty="realistic", objectives=["defend_punjab"]),
    )
    # Pick a friendly base near the PAF border (Pathankot if present, else any).
    pathankot = (
        db.query(CampaignBase)
        .filter(CampaignBase.campaign_id == campaign.id)
        .first()
    )
    assert pathankot is not None
    db.add(Squadron(
        campaign_id=campaign.id,
        base_id=pathankot.id,
        platform_id="mq9b_seaguardian",
        name="22 Squadron",
        call_sign="Guardian-1",
        strength=4,
        readiness_pct=80,
        xp=0,
    ))
    db.commit()

    # Adversary bases seeded at create time.
    assert db.query(AdversaryBase).filter_by(campaign_id=campaign.id).count() >= 10

    advance_turn(db, campaign)
    db.commit()

    cards = (
        db.query(IntelCard)
        .filter_by(campaign_id=campaign.id, source_type="drone_recon")
        .all()
    )
    assert len(cards) >= 1, "Expected at least one drone_recon card when MQ-9B is orbiting"
    # Payload shape.
    c = cards[0]
    assert c.payload["subject_kind"] == "adversary_base"
    assert "subject_id" in c.payload
    assert c.payload["faction"] in {"PAF", "PLAAF", "PLAN"}
    assert "observed_force" in c.payload


def test_advance_turn_no_drone_recon_without_drones():
    SessionLocal = _memory_db()
    db = SessionLocal()
    campaign = create_campaign(
        db, CampaignCreate(name="T2", difficulty="realistic", objectives=["defend_punjab"]),
    )
    advance_turn(db, campaign)
    db.commit()
    assert (
        db.query(IntelCard)
        .filter_by(campaign_id=campaign.id, source_type="drone_recon")
        .count() == 0
    )
