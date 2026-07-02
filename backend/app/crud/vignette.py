from datetime import datetime, UTC

from sqlalchemy.orm import Session

from app.models.vignette import Vignette
from app.models.campaign import Campaign
from app.models.event import CampaignEvent
from app.models.squadron import Squadron
from app.models.missile_stock import MissileStock
from app.models.ad_battery import ADBattery
from app.content.registry import platforms as platforms_reg
from app.engine.vignette.resolver import resolve
from app.engine.vignette.non_combat import is_non_combat, resolve_non_combat
from app.engine.vignette.bvr import PLATFORM_LOADOUTS
from app.engine.engagement import (
    EngagementResultError, validate_result, residual_forces, merge_outcomes,
)


class CommitValidationError(Exception):
    pass


class AlreadyResolvedError(Exception):
    pass


def _resolver_inputs(db: Session, campaign: Campaign, ps: dict) -> tuple[dict, list, list, dict]:
    """Build the platforms registry dict + load per-campaign missile/battery
    stock, exactly as the auto-resolve path in commit_vignette does. Shared
    by the auto path and the residual-force resolve in
    submit_engagement_result."""
    platforms_dict = {
        pid: {
            "combat_radius_km": p.combat_radius_km,
            "generation": p.generation,
            "radar_range_km": p.radar_range_km,
            "rcs_band": p.rcs_band,
        }
        for pid, p in platforms_reg().items()
    }
    stock_rows = db.query(MissileStock).filter_by(campaign_id=campaign.id).all()
    battery_rows = db.query(ADBattery).filter_by(campaign_id=campaign.id).all()
    battery_stock = {b.id: (b.interceptor_stock or 0) for b in battery_rows}
    ps_with_stock = dict(ps)
    ps_with_stock["missile_stock"] = {(r.base_id, r.weapon_id): r.stock for r in stock_rows}
    ps_with_stock["battery_stock"] = battery_stock
    return platforms_dict, stock_rows, battery_rows, ps_with_stock


def _apply_readiness_and_losses(
    db: Session, committed_force: dict, ps: dict, event_trace: list,
) -> None:
    """Apply the readiness-cost + airframe-loss side effects. Shared by the
    auto-resolve path and submit_engagement_result (called there with the
    residual event trace)."""
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


def _squadron_rows(db: Session, committed_force: dict) -> list[dict]:
    """Assemble plain dicts for committed squadrons — shape consumed by
    build_briefing/validate_result/residual_forces in app.engine.engagement."""
    rows = []
    for entry in committed_force.get("squadrons", []):
        sq = db.get(Squadron, entry["squadron_id"])
        if sq is None:
            continue
        rows.append({
            "id": sq.id,
            "call_sign": sq.call_sign,
            "platform_id": sq.platform_id,
            "base_id": sq.base_id,
            "strength": sq.strength,
        })
    return rows


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
    if vignette.status not in ("pending", "engaged"):
        raise AlreadyResolvedError(f"vignette {vignette.id} is {vignette.status}")

    # Stand-down (decline) path — Story mode only. No resolver called.
    if committed_force.get("decline"):
        if campaign.difficulty != "story":
            raise CommitValidationError("Stand down is only available in Story mode")
        vignette.committed_force = committed_force
        vignette.outcome = {
            "ind_kia": 0, "adv_kia": 0,
            "ind_airframes_lost": 0, "adv_airframes_lost": 0,
            "objective_met": False, "stand_down": True,
            "roe": committed_force.get("roe", "weapons_free"),
            "support": committed_force.get("support", {}),
            "munitions_expended": [], "munitions_cost_total_cr": 0,
        }
        vignette.event_trace = [{"t_min": 0, "kind": "stand_down"}]
        vignette.aar_text = (
            "Stand-down ordered — the engagement was declined; "
            "no forces were committed and no losses were taken."
        )
        vignette.status = "resolved"
        vignette.resolved_at = datetime.now(UTC)
        db.commit()
        db.refresh(vignette)
        return vignette

    # Validate against planning_state
    ps = vignette.planning_state or {}
    squadrons_committed = committed_force.get("squadrons", [])
    # allows_no_cap (Plan 19): scenarios where AD defends alone — empty
    # squadrons list is permitted. Non-allows_no_cap scenarios don't error
    # today on empty either, but the semantic is now explicit.
    if not squadrons_committed and not ps.get("allows_no_cap", False):
        # Preserve legacy behavior (no error) — AD-centric flag is additive.
        pass
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

    # Interactive mode: park the vignette in `engaged` state with a battle
    # briefing to be served next; the outcome is resolved later via
    # submit_engagement_result once the player reports the flown engagement.
    if committed_force.get("mode") == "interactive":
        if is_non_combat(ps.get("objective", {})):
            raise CommitValidationError("interactive mode is only available for combat vignettes")
        vignette.status = "engaged"
        vignette.committed_force = committed_force
        db.commit()
        db.refresh(vignette)
        return vignette

    # Route to non-combat resolver when objective kind is non-kinetic
    if is_non_combat(ps.get("objective", {})):
        outcome, event_trace = resolve_non_combat(ps, committed_force)
        stock_rows: list[MissileStock] = []
        battery_rows: list[ADBattery] = []
    else:
        platforms_dict, stock_rows, battery_rows, ps_with_stock = _resolver_inputs(db, campaign, ps)

        outcome, event_trace = resolve(
            ps_with_stock, committed_force, platforms_dict,
            seed=campaign.seed, year=vignette.year, quarter=vignette.quarter,
        )

        # Persist missile stock decrements back to DB.
        remaining = outcome.get("missile_stock_remaining", {}) or {}
        for r in stock_rows:
            key = (r.base_id, r.weapon_id)
            new_stock = remaining.get(key, r.stock)
            r.stock = max(0, int(new_stock))

        # Persist AD battery interceptor decrements back to DB.
        battery_remaining = outcome.get("battery_stock_remaining", {}) or {}
        for b in battery_rows:
            new_stock = battery_remaining.get(b.id, b.interceptor_stock)
            b.interceptor_stock = max(0, int(new_stock))

    # Apply readiness cost + combat losses to committed squadrons.
    # Base cost: 5% per committed squadron. Overcommit (>2x adversary) adds penalty.
    # Penalty: int((ratio - 2.0) * 3) extra percentage points. Capped at 30%.
    # kill events shape (from resolver): side=attacker_side, victim_squadron_id=<sqid>.
    # When ADV is the attacker, the victim is an IND squadron.
    _apply_readiness_and_losses(db, committed_force, ps, event_trace)

    vignette.status = "resolved"
    vignette.committed_force = committed_force
    vignette.event_trace = event_trace
    # `missile_stock_remaining` uses tuple keys for in-process book-keeping;
    # `battery_stock_remaining` keys on DB battery ids which vary across
    # campaigns (and would break replay determinism). Strip both before
    # JSON-persist — public consumers query the live MissileStock / ADBattery
    # rows for current state.
    outcome_for_db = {
        k: v for k, v in outcome.items()
        if k not in ("missile_stock_remaining", "battery_stock_remaining")
    }
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


def submit_engagement_result(
    db: Session,
    campaign: Campaign,
    vignette: Vignette,
    result: dict,
) -> Vignette:
    """Resolve an interactive engagement: validate the reported player-flight
    outcome, resolve whatever's left of the fight through the same seeded
    resolver the auto path uses, and merge both into the final vignette
    outcome. Raises EngagementResultError (plausibility caps) or
    AlreadyResolvedError (wrong status) — mapped to HTTP by the API layer."""
    if vignette.status != "engaged":
        raise AlreadyResolvedError(f"vignette {vignette.id} is {vignette.status}")

    ps = vignette.planning_state or {}
    committed_force = vignette.committed_force or {}

    squadron_rows = _squadron_rows(db, committed_force)
    squadron_rows_by_id = {r["id"]: r for r in squadron_rows}
    depot_stock = {
        (r.base_id, r.weapon_id): r.stock
        for r in db.query(MissileStock).filter_by(campaign_id=campaign.id).all()
    }
    loadouts = PLATFORM_LOADOUTS

    validate_result(result, ps, committed_force, depot_stock, squadron_rows, loadouts)

    ps_res, cf_res = residual_forces(ps, committed_force, result)

    if cf_res.get("squadrons") and ps_res.get("adversary_force"):
        platforms_dict, stock_rows, battery_rows, ps_with_stock = _resolver_inputs(db, campaign, ps_res)
        residual_outcome, residual_trace = resolve(
            ps_with_stock, cf_res, platforms_dict,
            seed=campaign.seed, year=vignette.year, quarter=vignette.quarter,
        )

        remaining = residual_outcome.get("missile_stock_remaining", {}) or {}
        for r in stock_rows:
            key = (r.base_id, r.weapon_id)
            new_stock = remaining.get(key, r.stock)
            r.stock = max(0, int(new_stock))

        battery_remaining = residual_outcome.get("battery_stock_remaining", {}) or {}
        for b in battery_rows:
            new_stock = battery_remaining.get(b.id, b.interceptor_stock)
            b.interceptor_stock = max(0, int(new_stock))
    else:
        residual_outcome, residual_trace = None, []

    # Decrement depot stock for the player's flown munitions.
    player_row = squadron_rows_by_id.get(result["player_squadron_id"])
    player_base_id = player_row["base_id"] if player_row else None
    for weapon, count in (result.get("munitions_expended", {}) or {}).items():
        if count <= 0 or player_base_id is None:
            continue
        stock_row = db.query(MissileStock).filter_by(
            campaign_id=campaign.id, base_id=player_base_id, weapon_id=weapon,
        ).first()
        if stock_row is not None:
            stock_row.stock = max(0, (stock_row.stock or 0) - count)

    flight_airframes = min(4, next(
        (s["airframes"] for s in committed_force.get("squadrons", [])
         if s["squadron_id"] == result["player_squadron_id"]),
        0,
    ))
    outcome = merge_outcomes(result, residual_outcome, ps, flight_airframes)
    # merge_outcomes lacks committed_force, so it falls back to
    # residual_outcome/ps for roe+support — override with the actual
    # committed force here.
    outcome["roe"] = committed_force.get("roe", "weapons_free")
    outcome["support"] = committed_force.get("support", {})

    # Apply readiness cost (full committed force, same rule as auto) +
    # residual combat losses (residual_trace kill events).
    _apply_readiness_and_losses(db, committed_force, ps, residual_trace)

    # The flown flight's own losses are reported directly by the player, not
    # inferred from a kill event — deduct them from the squadron strength.
    if player_row is not None:
        player_sq = db.get(Squadron, player_row["id"])
        if player_sq is not None:
            player_sq.strength = max(
                0, (player_sq.strength or 0) - result.get("flight_losses", 0),
            )

    event_trace = [{"t_min": 0, "kind": "engagement_player_flight", **result}] + residual_trace

    vignette.status = "resolved"
    vignette.event_trace = event_trace
    outcome_for_db = {
        k: v for k, v in outcome.items()
        if k not in ("missile_stock_remaining", "battery_stock_remaining")
    }
    vignette.outcome = outcome_for_db
    vignette.aar_text = (
        f"Vignette {vignette.scenario_id} resolved after an interactive engagement "
        f"({'disengaged' if result.get('disengaged') else 'flight fought through'}): "
        f"IND airframes lost {outcome['ind_kia']}, "
        f"ADV airframes lost {outcome['adv_kia']}, "
        f"objective_met={outcome['objective_met']}."
    )
    vignette.resolved_at = datetime.now(UTC)

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
            "interactive": True,
        },
    ))

    db.commit()
    db.refresh(vignette)
    return vignette
