"""Offensive operations endpoints — preview / commit / list / detail.

Strikes are resolved synchronously on commit. Cap of 2 strikes per
quarter. Gated behind Campaign.offensive_unlocked (set by advance_turn
after the first reactive vignette resolves).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.engine.diplomacy import tick_diplomacy_temp
from app.engine.offensive.planning import validate_strike_package, forecast_strike
from app.engine.offensive.resolver import resolve_strike
from app.engine.rng import subsystem_rng
from app.content.registry import (
    adversary_bases as _adv_bases_catalog,
    platforms as _plats_catalog,
)
from app.engine.vignette.bvr import PLATFORM_LOADOUTS
from app.models.adversary_base import AdversaryBase
from app.models.base_damage import BaseDamage
from app.models.campaign import Campaign
from app.models.diplomatic_state import DiplomaticState
from app.models.intel import IntelCard
from app.models.missile_stock import MissileStock
from app.models.offensive_op import OffensiveOp
from app.models.squadron import Squadron
from app.schemas.offensive import (
    StrikeListResponse, StrikePackageRequest, StrikePreviewResponse, StrikeRead,
)

router = APIRouter(prefix="/api/campaigns/{campaign_id}", tags=["offensive"])

_STRIKES_PER_QUARTER_CAP = 2
_DRONE_PLATFORM_IDS = {"tapas_uav", "ghatak_ucav", "heron_tp", "mq9b_seaguardian"}


def _campaign_or_404(db: Session, cid: int) -> Campaign:
    c = db.get(Campaign, cid)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    return c


def _intel_quality_for_target(db: Session, campaign_id: int, target_id_str: str) -> str:
    cards = (
        db.query(IntelCard)
        .filter_by(campaign_id=campaign_id, source_type="drone_recon")
        .order_by(IntelCard.id.desc())
        .all()
    )
    for c in cards:
        if (c.payload or {}).get("subject_id") == target_id_str:
            return (c.payload.get("observed_force") or {}).get("tier", "low")
    return "low"


def _build_target_dict(
    db: Session, campaign_id: int, target: AdversaryBase,
) -> dict:
    """Assemble the resolver-shape target dict from ORM + content + damage state."""
    bd = db.query(BaseDamage).filter_by(
        campaign_id=campaign_id, adversary_base_id=target.id,
    ).first()
    spec = _adv_bases_catalog().get(target.base_id_str)
    home_platforms = list(spec.home_platforms) if spec else []
    garrisoned_count = max(0, target.shelter_count - (bd.garrisoned_loss if bd else 0))
    # Each forward/main base in the catalog is presumed to have 1 AD battery
    # unless its damage row has ad_destroyed.
    ad_battery_count = (
        0 if (bd and bd.ad_destroyed)
        else (1 if target.tier in ("main", "forward") else 0)
    )
    return {
        "id": target.id,
        "base_id_str": target.base_id_str,
        "shelter_count": target.shelter_count,
        "garrisoned_count": garrisoned_count,
        "garrisoned_platforms": home_platforms,
        "ad_battery_count": ad_battery_count,
        "ad_destroyed": bool(bd and bd.ad_destroyed),
        "command_node": bool(spec.command_node) if spec else False,
        "value": int(spec.value) if spec else 3,
    }


def _enrich_squadron(sq: Squadron) -> dict:
    """Return resolver-shape squadron dict, looking up platform role + RCS from catalog."""
    p = _plats_catalog().get(sq.platform_id)
    role = p.role if p else "multirole"
    rcs = p.rcs_band if p else "conventional"
    loadout = []
    pl = PLATFORM_LOADOUTS.get(sq.platform_id, {})
    for k in ("bvr", "wvr"):
        loadout.extend(pl.get(k, []))
    return {
        "id": sq.id,
        "platform_id": sq.platform_id,
        "airframes": sq.strength,
        "role": role,
        "rcs_band": rcs,
        "loadout": loadout,
        "base_id": sq.base_id,
    }


def _build_package(
    db: Session, campaign_id: int, payload: StrikePackageRequest,
) -> dict:
    sq_rows = {s.id: s for s in db.query(Squadron).filter_by(campaign_id=campaign_id).all()}
    squadrons: list[dict] = []
    for entry in payload.squadrons:
        sq = sq_rows.get(entry.squadron_id)
        if sq is None:
            continue
        d = _enrich_squadron(sq)
        d["airframes"] = min(entry.airframes, sq.strength)
        squadrons.append(d)
    return {
        "profile": payload.profile,
        "squadrons": squadrons,
        "weapons_planned": dict(payload.weapons_planned),
        "support": dict(payload.support),
        "roe": payload.roe,
    }


@router.post("/strikes/preview", response_model=StrikePreviewResponse)
def preview_strike(
    campaign_id: int,
    payload: StrikePackageRequest,
    db: Session = Depends(get_db),
):
    camp = _campaign_or_404(db, campaign_id)
    if not camp.offensive_unlocked:
        raise HTTPException(409, "Offensive operations not yet authorized.")
    target = db.get(AdversaryBase, payload.target_base_id)
    if target is None or target.campaign_id != campaign_id:
        raise HTTPException(404, "Target base not found")

    package = _build_package(db, campaign_id, payload)
    if not package["squadrons"]:
        raise HTTPException(400, "No valid squadrons in package.")

    launch_base_id = package["squadrons"][0]["base_id"]
    weapons_avail = {
        s.weapon_id: s.stock for s in db.query(MissileStock).filter_by(
            campaign_id=campaign_id, base_id=launch_base_id,
        ).all()
    }
    target_dict = _build_target_dict(db, campaign_id, target)
    issues = validate_strike_package(package, target_dict, weapons_avail)
    intel_q = _intel_quality_for_target(db, campaign_id, target.base_id_str)
    fc = forecast_strike(package, target_dict, intel_quality=intel_q)
    return StrikePreviewResponse(
        issues=issues, forecast=fc, weapons_avail=weapons_avail, intel_quality=intel_q,
    )


@router.post("/strikes", response_model=StrikeRead, status_code=201)
def commit_strike(
    campaign_id: int,
    payload: StrikePackageRequest,
    db: Session = Depends(get_db),
):
    camp = _campaign_or_404(db, campaign_id)
    if not camp.offensive_unlocked:
        raise HTTPException(409, "Offensive operations not yet authorized.")

    quarter_strikes = db.query(OffensiveOp).filter_by(
        campaign_id=campaign_id, year=camp.current_year, quarter=camp.current_quarter,
    ).count()
    if quarter_strikes >= _STRIKES_PER_QUARTER_CAP:
        raise HTTPException(409, f"Strike cap reached for this quarter ({_STRIKES_PER_QUARTER_CAP}).")

    target = db.get(AdversaryBase, payload.target_base_id)
    if target is None or target.campaign_id != campaign_id:
        raise HTTPException(404, "Target base not found")

    package = _build_package(db, campaign_id, payload)
    if not package["squadrons"]:
        raise HTTPException(400, "No valid squadrons in package.")
    target_dict = _build_target_dict(db, campaign_id, target)
    launch_base_id = package["squadrons"][0]["base_id"]
    weapons_avail = {
        s.weapon_id: s.stock for s in db.query(MissileStock).filter_by(
            campaign_id=campaign_id, base_id=launch_base_id,
        ).all()
    }
    issues = validate_strike_package(package, target_dict, weapons_avail)
    if issues:
        raise HTTPException(400, "; ".join(issues))

    # Deterministic per (seed, year, quarter, strike#-in-quarter).
    rng = subsystem_rng(camp.seed, "offensive_strike", camp.current_year, camp.current_quarter)
    for _ in range(quarter_strikes):
        rng.random()  # advance stream so strike #2 differs from #1
    outcome = resolve_strike(package, target_dict, rng=rng)

    # Apply BDA — upsert into BaseDamage.
    bd = db.query(BaseDamage).filter_by(
        campaign_id=campaign_id, adversary_base_id=target.id,
    ).first()
    if bd is None:
        bd = BaseDamage(
            campaign_id=campaign_id, adversary_base_id=target.id,
            shelter_loss_pct=0, runway_disabled_quarters_remaining=0,
            ad_destroyed=False, ad_destroyed_quarters_since=0,
            garrisoned_loss=0,
        )
        db.add(bd)
    d = outcome["damage"]
    bd.shelter_loss_pct = max(bd.shelter_loss_pct or 0, d["shelter_loss_pct"])
    bd.runway_disabled_quarters_remaining = max(
        bd.runway_disabled_quarters_remaining or 0,
        d["runway_disabled_quarters_remaining"],
    )
    if d["ad_destroyed"]:
        bd.ad_destroyed = True
        bd.ad_destroyed_quarters_since = 0
    bd.garrisoned_loss = (bd.garrisoned_loss or 0) + d["garrisoned_loss"]

    # Decrement weapon stock at launch base.
    for wid, used in outcome["weapons_consumed"].items():
        row = db.query(MissileStock).filter_by(
            campaign_id=campaign_id, base_id=launch_base_id, weapon_id=wid,
        ).first()
        if row is not None:
            row.stock = max(0, row.stock - used)

    # Decrement squadron strength proportional to package contribution.
    total_lost = outcome["ind_airframes_lost"]
    pkg_total = sum(e.airframes for e in payload.squadrons) or 1
    sq_rows = {s.id: s for s in db.query(Squadron).filter_by(campaign_id=campaign_id).all()}
    for entry in payload.squadrons:
        loss = int(round(total_lost * entry.airframes / pkg_total))
        sq = sq_rows.get(entry.squadron_id)
        if sq is not None:
            sq.strength = max(0, sq.strength - loss)

    # Diplomatic blowback — drop on target faction.
    diplo = db.query(DiplomaticState).filter_by(
        campaign_id=campaign_id, faction=target.faction,
    ).first()
    if diplo is not None:
        diplo.temperature_pct = tick_diplomacy_temp(
            diplo.temperature_pct, strikes_this_quarter=1,
        )

    op = OffensiveOp(
        campaign_id=campaign_id,
        year=camp.current_year, quarter=camp.current_quarter,
        target_base_id=target.id,
        profile=payload.profile, roe=payload.roe,
        package_json=package,
        outcome_json={
            "damage": d,
            "ind_airframes_lost": total_lost,
            "weapons_consumed": outcome["weapons_consumed"],
        },
        event_trace=outcome["events"],
        aar_text="",
        status="resolved",
    )
    db.add(op)
    db.commit()
    db.refresh(op)
    return op


@router.get("/strikes", response_model=StrikeListResponse)
def list_strikes(campaign_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(OffensiveOp)
        .filter_by(campaign_id=campaign_id)
        .order_by(OffensiveOp.id.desc())
        .all()
    )
    return StrikeListResponse(strikes=rows)


@router.get("/strikes/{strike_id}", response_model=StrikeRead)
def get_strike(campaign_id: int, strike_id: int, db: Session = Depends(get_db)):
    op = db.get(OffensiveOp, strike_id)
    if op is None or op.campaign_id != campaign_id:
        raise HTTPException(404, "Strike not found")
    return op
