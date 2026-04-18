from datetime import datetime

from sqlalchemy.orm import Session

from app.models.vignette import Vignette
from app.models.campaign import Campaign
from app.models.event import CampaignEvent
from app.content.registry import platforms as platforms_reg
from app.engine.vignette.resolver import resolve


class CommitValidationError(Exception):
    pass


class AlreadyResolvedError(Exception):
    pass


def list_pending_vignettes(db: Session, campaign_id: int) -> list[Vignette]:
    return db.query(Vignette).filter(
        Vignette.campaign_id == campaign_id,
        Vignette.status == "pending",
    ).order_by(Vignette.year.desc(), Vignette.quarter.desc(), Vignette.id.desc()).all()


def get_vignette(db: Session, campaign_id: int, vignette_id: int) -> Vignette | None:
    return db.query(Vignette).filter(
        Vignette.campaign_id == campaign_id,
        Vignette.id == vignette_id,
    ).first()


def commit_vignette(
    db: Session,
    campaign: Campaign,
    vignette: Vignette,
    committed_force: dict,
) -> Vignette:
    if vignette.status != "pending":
        raise AlreadyResolvedError(f"vignette {vignette.id} is {vignette.status}")

    # Validate against planning_state
    ps = vignette.planning_state or {}
    eligible_by_id = {s["squadron_id"]: s for s in ps.get("eligible_squadrons", [])}
    for entry in committed_force.get("squadrons", []):
        sid = entry["squadron_id"]
        if sid not in eligible_by_id:
            raise CommitValidationError(f"squadron {sid} not in eligible list")
        max_airframes = eligible_by_id[sid]["airframes_available"]
        if entry["airframes"] > max_airframes:
            raise CommitValidationError(
                f"squadron {sid}: airframes {entry['airframes']} > available {max_airframes}"
            )
    if committed_force.get("roe") not in ps.get("roe_options", []):
        raise CommitValidationError(f"roe {committed_force.get('roe')!r} not allowed")

    # Build platforms_registry dict for the resolver
    platforms_dict = {
        pid: {
            "combat_radius_km": p.combat_radius_km,
            "generation": p.generation,
            "radar_range_km": p.radar_range_km,
            "rcs_band": p.rcs_band,
        }
        for pid, p in platforms_reg().items()
    }

    outcome, event_trace = resolve(
        ps, committed_force, platforms_dict,
        seed=campaign.seed, year=vignette.year, quarter=vignette.quarter,
    )

    vignette.status = "resolved"
    vignette.committed_force = committed_force
    vignette.event_trace = event_trace
    vignette.outcome = outcome
    vignette.aar_text = (
        f"Vignette {vignette.scenario_id} resolved: "
        f"IND airframes lost {outcome['ind_kia']}, "
        f"ADV airframes lost {outcome['adv_kia']}, "
        f"objective_met={outcome['objective_met']}."
    )
    vignette.resolved_at = datetime.utcnow()

    db.add(CampaignEvent(
        campaign_id=campaign.id,
        year=vignette.year,
        quarter=vignette.quarter,
        event_type="vignette_resolved",
        payload={
            "vignette_id": vignette.id,
            "scenario_id": vignette.scenario_id,
            "scenario_name": ps.get("scenario_name", ""),
            "ao": ps.get("ao", {}),
            "outcome": outcome,
        },
    ))

    db.commit()
    db.refresh(vignette)
    return vignette
