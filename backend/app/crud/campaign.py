import random
from sqlalchemy.orm import Session

from app.models.campaign import Campaign
from app.models.event import CampaignEvent
from app.models.rd_program import RDProgramState
from app.models.acquisition import AcquisitionOrder
from app.models.squadron import Squadron
from app.models.adversary import AdversaryState
from app.models.intel import IntelCard
from app.models.vignette import Vignette
from app.models.campaign_base import CampaignBase
from app.schemas.campaign import CampaignCreate
from app.engine.turn import advance as engine_advance
from app.content.registry import rd_programs as rd_program_specs
from app.content.registry import adversary_roadmap as adversary_roadmap_reg
from app.content.registry import intel_templates as intel_templates_reg
from app.content.registry import (
    scenario_templates as scenario_templates_reg,
    bases as bases_reg,
    platforms as platforms_reg,
)


STARTING_BUDGET_CR = 620000  # ~₹6.2L cr — 1 year cushion of pre-existing reserves


def create_campaign(db: Session, payload: CampaignCreate) -> Campaign:
    seed = payload.seed if payload.seed is not None else random.randint(1, 2**31 - 1)
    campaign = Campaign(
        name=payload.name,
        seed=seed,
        starting_year=2026,
        starting_quarter=2,
        current_year=2026,
        current_quarter=2,
        difficulty=payload.difficulty,
        objectives_json=payload.objectives,
        budget_cr=STARTING_BUDGET_CR,
        quarterly_grant_cr=155000,
        current_allocation_json=None,
        reputation=50,
    )
    db.add(campaign)
    db.flush()

    event = CampaignEvent(
        campaign_id=campaign.id,
        year=campaign.starting_year,
        quarter=campaign.starting_quarter,
        event_type="campaign_created",
        payload={"seed": seed, "difficulty": payload.difficulty},
    )
    db.add(event)

    # Seed historically-grounded 2026-Q2 starting state (Task 10).
    from app.crud.seed_starting_state import seed_starting_state
    seed_starting_state(db, campaign)

    db.commit()
    db.refresh(campaign)
    return campaign


def get_campaign(db: Session, campaign_id: int) -> Campaign | None:
    return db.query(Campaign).filter(Campaign.id == campaign_id).first()


def _serialize_rd(state: RDProgramState) -> dict:
    return {
        "id": state.id,
        "program_id": state.program_id,
        "progress_pct": state.progress_pct,
        "funding_level": state.funding_level,
        "status": state.status,
        "milestones_hit": list(state.milestones_hit or []),
        "cost_invested_cr": state.cost_invested_cr,
        "quarters_active": state.quarters_active,
    }


def _serialize_order(order: AcquisitionOrder) -> dict:
    return {
        "id": order.id,
        "platform_id": order.platform_id,
        "quantity": order.quantity,
        "first_delivery_year": order.first_delivery_year,
        "first_delivery_quarter": order.first_delivery_quarter,
        "foc_year": order.foc_year,
        "foc_quarter": order.foc_quarter,
        "delivered": order.delivered,
        "total_cost_cr": order.total_cost_cr,
    }


def _serialize_squadron(sq: Squadron) -> dict:
    return {
        "id": sq.id,
        "name": sq.name,
        "platform_id": sq.platform_id,
        "base_id": sq.base_id,
        "strength": sq.strength,
        "readiness_pct": sq.readiness_pct,
        "xp": sq.xp,
    }


def advance_turn(db: Session, campaign: Campaign) -> Campaign:
    rd_rows = db.query(RDProgramState).filter(RDProgramState.campaign_id == campaign.id).all()
    acq_rows = db.query(AcquisitionOrder).filter(AcquisitionOrder.campaign_id == campaign.id).all()
    sq_rows = db.query(Squadron).filter(Squadron.campaign_id == campaign.id).all()
    adv_rows = db.query(AdversaryState).filter(AdversaryState.campaign_id == campaign.id).all()

    base_rows = db.query(CampaignBase).filter(CampaignBase.campaign_id == campaign.id).all()
    # Build a mapping from base_id -> {name, lat, lon} using the content
    # registry for lat/lon (CampaignBase only carries template_id + config).
    base_templates = bases_reg()
    bases_dict = {}
    for row in base_rows:
        tpl = base_templates.get(row.template_id)
        if tpl is None:
            continue
        bases_dict[row.id] = {
            "name": tpl.name,
            "lat": tpl.lat,
            "lon": tpl.lon,
        }
    # Platforms registry: flat dict of platform_id -> {combat_radius_km, generation, radar_range_km, rcs_band}
    platforms_dict = {
        pid: {
            "combat_radius_km": p.combat_radius_km,
            "generation": p.generation,
            "radar_range_km": p.radar_range_km,
            "rcs_band": p.rcs_band,
        }
        for pid, p in platforms_reg().items()
    }

    pending_exists = db.query(Vignette).filter(
        Vignette.campaign_id == campaign.id,
        Vignette.status == "pending",
    ).first() is not None

    # Convert content RDProgramSpec -> dict the engine expects
    specs = {
        spec_id: {
            "id": spec.id,
            "name": spec.name,
            "description": spec.description,
            "base_duration_quarters": spec.base_duration_quarters,
            "base_cost_cr": spec.base_cost_cr,
            "dependencies": list(spec.dependencies),
        }
        for spec_id, spec in rd_program_specs().items()
    }

    ctx = {
        "seed": campaign.seed,
        "year": campaign.current_year,
        "quarter": campaign.current_quarter,
        "treasury_cr": campaign.budget_cr,
        "quarterly_grant_cr": campaign.quarterly_grant_cr,
        "current_allocation_json": campaign.current_allocation_json,
        "rd_states": [_serialize_rd(r) for r in rd_rows],
        "acquisition_orders": [_serialize_order(o) for o in acq_rows],
        "squadrons": [_serialize_squadron(s) for s in sq_rows],
        "rd_specs": specs,
        "adversary_states": {row.faction: dict(row.state) for row in adv_rows},
        "adversary_roadmap": adversary_roadmap_reg(),
        "intel_templates": intel_templates_reg(),
        "scenario_templates": scenario_templates_reg(),
        "bases_registry": bases_dict,
        "platforms_registry": platforms_dict,
        "pending_vignette_exists": pending_exists,
    }

    # Capture the FROM clock so events that describe this turn are tagged
    # with the quarter they happened in (not the quarter we're advancing into).
    # The exception is `turn_advanced`, which the engine emits with the post-
    # advance clock in its payload — we still tag its DB row with the FROM
    # clock for consistency with all other events from the same turn.
    from_year = campaign.current_year
    from_quarter = campaign.current_quarter

    result = engine_advance(ctx)

    campaign.current_year = result.next_year
    campaign.current_quarter = result.next_quarter
    campaign.budget_cr = result.next_treasury_cr

    rd_by_id = {r.id: r for r in rd_rows}
    for s in result.next_rd_states:
        row = rd_by_id[s["id"]]
        row.progress_pct = s["progress_pct"]
        row.status = s["status"]
        row.milestones_hit = s["milestones_hit"]
        row.cost_invested_cr = s["cost_invested_cr"]
        row.quarters_active = s["quarters_active"]

    acq_by_id = {o.id: o for o in acq_rows}
    for o in result.next_acquisition_orders:
        row = acq_by_id[o["id"]]
        row.delivered = o["delivered"]

    sq_by_id = {s.id: s for s in sq_rows}
    for s in result.next_squadrons:
        row = sq_by_id[s["id"]]
        row.readiness_pct = s["readiness_pct"]

    adv_by_faction = {r.faction: r for r in adv_rows}
    for faction, state in result.next_adversary_states.items():
        if faction in adv_by_faction:
            adv_by_faction[faction].state = state
        else:
            db.add(AdversaryState(campaign_id=campaign.id, faction=faction, state=state))

    for card in result.new_intel_cards:
        db.add(IntelCard(
            campaign_id=campaign.id,
            appeared_year=from_year,
            appeared_quarter=from_quarter,
            source_type=card["source_type"],
            confidence=card["confidence"],
            truth_value=card["truth_value"],
            payload=card["payload"],
        ))

    for v in result.new_vignettes:
        db.add(Vignette(
            campaign_id=campaign.id,
            year=v["year"],
            quarter=v["quarter"],
            scenario_id=v["scenario_id"],
            status="pending",
            planning_state=v["planning_state"],
            committed_force=None,
            event_trace=[],
            aar_text="",
            outcome={},
        ))

    for e in result.events:
        db.add(CampaignEvent(
            campaign_id=campaign.id,
            year=from_year,
            quarter=from_quarter,
            event_type=e["event_type"],
            payload=e["payload"],
        ))

    db.commit()
    db.refresh(campaign)
    return campaign
