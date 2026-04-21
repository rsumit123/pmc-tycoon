from datetime import datetime, UTC

from sqlalchemy.orm import Session

from app.models.vignette import Vignette
from app.models.campaign import Campaign
from app.models.event import CampaignEvent
from app.models.squadron import Squadron
from app.models.missile_stock import MissileStock
from app.content.registry import platforms as platforms_reg
from app.engine.vignette.resolver import resolve
from app.engine.vignette.non_combat import is_non_combat, resolve_non_combat


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
    tanker_selected = bool(
        (committed_force.get("support") or {}).get("tanker", False)
    )
    for entry in committed_force.get("squadrons", []):
        sid = entry["squadron_id"]
        if sid not in eligible_by_id:
            raise CommitValidationError(f"squadron {sid} not in eligible list")
        sq_info = eligible_by_id[sid]
        max_airframes = sq_info["airframes_available"]
        if entry["airframes"] > max_airframes:
            raise CommitValidationError(
                f"squadron {sid}: airframes {entry['airframes']} > available {max_airframes}"
            )
        # Range-tier gating: C is hard-blocked, B requires tanker.
        tier = sq_info.get("range_tier", "A" if sq_info.get("in_range") else "C")
        if tier == "C":
            raise CommitValidationError(
                f"squadron {sid} ({sq_info.get('base_name', '')}) is {sq_info.get('distance_km', 0)} km "
                f"from the AO — beyond tanker reach"
            )
        if tier == "B" and not tanker_selected:
            raise CommitValidationError(
                f"squadron {sid} ({sq_info.get('base_name', '')}) is out of unrefuelled range — "
                f"tanker support is required to commit this squadron"
            )
    if committed_force.get("roe") not in ps.get("roe_options", []):
        raise CommitValidationError(f"roe {committed_force.get('roe')!r} not allowed")

    # Route to non-combat resolver when objective kind is non-kinetic
    if is_non_combat(ps.get("objective", {})):
        outcome, event_trace = resolve_non_combat(ps, committed_force)
        stock_rows: list[MissileStock] = []
    else:
        # Build platforms_registry dict for the combat resolver
        platforms_dict = {
            pid: {
                "combat_radius_km": p.combat_radius_km,
                "generation": p.generation,
                "radar_range_km": p.radar_range_km,
                "rcs_band": p.rcs_band,
            }
            for pid, p in platforms_reg().items()
        }

        # Load per-base missile stock for this campaign and pass into resolver.
        stock_rows = db.query(MissileStock).filter_by(
            campaign_id=campaign.id,
        ).all()
        ps_with_stock = dict(ps)
        ps_with_stock["missile_stock"] = {
            (r.base_id, r.weapon_id): r.stock for r in stock_rows
        }

        outcome, event_trace = resolve(
            ps_with_stock, committed_force, platforms_dict,
            seed=campaign.seed, year=vignette.year, quarter=vignette.quarter,
        )

        # Persist stock decrements back to DB.
        remaining = outcome.get("missile_stock_remaining", {}) or {}
        for r in stock_rows:
            key = (r.base_id, r.weapon_id)
            new_stock = remaining.get(key, r.stock)
            r.stock = max(0, int(new_stock))

    # Apply readiness cost to committed squadrons.
    # Base cost: 5% per committed squadron. Overcommit (>2x adversary) adds penalty.
    # Penalty: int((ratio - 2.0) * 3) extra percentage points. Capped at 30%.
    ind_total = sum(e.get("airframes", 0) for e in committed_force.get("squadrons", []))
    adv_total = sum(
        e.get("count", 0) for e in ps.get("adversary_force", [])
    ) or 1
    overcommit_ratio = ind_total / adv_total

    base_readiness_cost = 5
    penalty = max(0, int((overcommit_ratio - 2.0) * 3))
    total_readiness_cost = min(30, base_readiness_cost + penalty)

    for commit_sq in committed_force.get("squadrons", []):
        sq = db.get(Squadron, commit_sq["squadron_id"])
        if sq is None:
            continue
        sq.readiness_pct = max(0, (sq.readiness_pct or 0) - total_readiness_cost)

    # Deduct airframes lost in combat from each victim squadron.
    # kill events shape (from resolver): side=attacker_side, victim_squadron_id=<sqid>.
    # When ADV is the attacker, the victim is an IND squadron.
    losses_by_sqid: dict[int, int] = {}
    for ev in event_trace:
        if ev.get("kind") != "kill":
            continue
        if ev.get("side") != "adv":
            continue
        vsid = ev.get("victim_squadron_id")
        if vsid is None:
            continue
        losses_by_sqid[int(vsid)] = losses_by_sqid.get(int(vsid), 0) + 1

    for sqid, lost in losses_by_sqid.items():
        sq = db.get(Squadron, sqid)
        if sq is None:
            continue
        sq.strength = max(0, (sq.strength or 0) - lost)

    vignette.status = "resolved"
    vignette.committed_force = committed_force
    vignette.event_trace = event_trace
    # `missile_stock_remaining` uses tuple keys for in-process book-keeping —
    # strip before JSON-persist. Public consumers can query MissileStock rows.
    outcome_for_db = {k: v for k, v in outcome.items() if k != "missile_stock_remaining"}
    vignette.outcome = outcome_for_db
    vignette.aar_text = (
        f"Vignette {vignette.scenario_id} resolved: "
        f"IND airframes lost {outcome['ind_kia']}, "
        f"ADV airframes lost {outcome['adv_kia']}, "
        f"objective_met={outcome['objective_met']}."
    )
    vignette.resolved_at = datetime.now(UTC)

    # Munitions telemetry event — Plan 18: cost is pre-paid via Acquisitions,
    # so this event no longer debits the treasury. Retained for analytics so
    # the AAR can show "stock consumed ~= Rs X cr replacement cost".
    munitions_cost = int(outcome.get("munitions_cost_total_cr", 0) or 0)
    if munitions_cost > 0:
        db.add(CampaignEvent(
            campaign_id=campaign.id,
            year=vignette.year,
            quarter=vignette.quarter,
            event_type="munitions_cost",
            payload={
                "vignette_id": vignette.id,
                "total_cost_cr": munitions_cost,
                "munitions": outcome.get("munitions_expended", []),
                "stock_consumed": outcome.get("missile_stock_consumed", {}),
            },
        ))

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
            "outcome": outcome_for_db,
        },
    ))

    db.commit()
    db.refresh(vignette)
    return vignette
