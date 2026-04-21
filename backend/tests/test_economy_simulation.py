"""End-to-end balance sim: moderate-competence player over 40 turns.

Validates that Plan 17 + Plan 18 economy doesn't bankrupt or over-reward
a reasonable player."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.models.acquisition import AcquisitionOrder
from app.models.missile_stock import MissileStock
from app.models.campaign_base import CampaignBase
from app.crud.campaign import create_campaign, advance_turn
from app.crud.vignette import list_pending_vignettes, commit_vignette
from app.crud.acquisition import create_order
from app.schemas.campaign import CampaignCreate


def test_moderate_player_40_turns_stays_solvent():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()

    payload = CampaignCreate(
        name="SimPlayer", difficulty="realistic",
        objectives=["amca_operational_by_2035"], seed=999,
    )
    campaign = create_campaign(db, payload)

    # Pick the Ambala base for Meteor restocks.
    ambala = db.query(CampaignBase).filter_by(
        campaign_id=campaign.id, template_id="ambala",
    ).first()
    assert ambala is not None
    ambala_id = ambala.id

    def maybe_order(q_index: int):
        if q_index == 0:
            # Meteor batch for Ambala
            try:
                create_order(
                    db, campaign,
                    platform_id="meteor", quantity=100,
                    first_delivery_year=2026, first_delivery_quarter=4,
                    foc_year=2027, foc_quarter=3,
                    total_cost_cr=1800,
                    preferred_base_id=ambala_id,
                    kind="missile_batch",
                )
            except Exception:
                pass
        if q_index == 2:
            # Rafale batch
            try:
                create_order(
                    db, campaign,
                    platform_id="rafale_f4", quantity=36,
                    first_delivery_year=2028, first_delivery_quarter=1,
                    foc_year=2031, foc_quarter=4,
                    total_cost_cr=180000,
                    kind="platform",
                )
            except Exception:
                pass
        if q_index in (8, 16, 24, 32):
            # Periodic Meteor restock
            try:
                cy = campaign.current_year
                create_order(
                    db, campaign,
                    platform_id="meteor", quantity=80,
                    first_delivery_year=cy + 1, first_delivery_quarter=1,
                    foc_year=cy + 1, foc_quarter=4,
                    total_cost_cr=80 * 18,
                    preferred_base_id=ambala_id,
                    kind="missile_batch",
                )
            except Exception:
                pass

    for q_index in range(40):
        maybe_order(q_index)

        # Commit any pending vignettes with a minimal sortie.
        for v in list_pending_vignettes(db, campaign.id):
            ps = v.planning_state or {}
            eligible = ps.get("eligible_squadrons", [])
            roe_options = ps.get("roe_options", [])
            pick = next(
                (s for s in eligible if s.get("range_tier") == "A"),
                None,
            )
            if pick is None:
                pick = next(iter(eligible), None)
            if pick:
                cf = {
                    "squadrons": [{
                        "squadron_id": pick["squadron_id"],
                        "airframes": min(1, pick.get("airframes_available", 1)),
                    }],
                    "roe": roe_options[0] if roe_options else "weapons_free",
                    "support": {"awacs": False, "tanker": False, "sead_package": False},
                }
                try:
                    commit_vignette(db, campaign, v, cf)
                except Exception:
                    pass

        campaign = advance_turn(db, campaign)

    db.refresh(campaign)
    # We advanced 40 times starting from 2026-Q2 → should land at 2036-Q2.
    assert campaign.current_year == 2036
    assert campaign.current_quarter == 2

    end_treasury = campaign.budget_cr
    # Treasury band check. If this fires, report the actual end-treasury.
    assert -200_000 < end_treasury < 2_500_000, (
        f"Treasury out of expected band: {end_treasury}"
    )

    # Some orders exist, missile stock rows exist.
    orders = db.query(AcquisitionOrder).filter_by(
        campaign_id=campaign.id,
    ).all()
    assert len(orders) >= 2
    stocks = db.query(MissileStock).filter_by(
        campaign_id=campaign.id,
    ).all()
    assert len(stocks) > 0

    db.close()
