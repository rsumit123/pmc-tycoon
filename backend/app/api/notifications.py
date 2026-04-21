"""GET /api/campaigns/{id}/notifications — synthesizes a live notification
list from low/empty missile stocks, empty AD batteries, pending vignettes,
and recent rd/acquisition CampaignEvent rows. No persistent state."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.content.registry import bases as bases_reg
from app.crud.campaign import get_campaign
from app.engine.vignette.bvr import PLATFORM_LOADOUTS
from app.models.ad_battery import ADBattery
from app.models.campaign_base import CampaignBase
from app.models.event import CampaignEvent
from app.models.missile_stock import MissileStock
from app.models.squadron import Squadron
from app.models.vignette import Vignette
from app.schemas.notification import Notification, NotificationListResponse

router = APIRouter(prefix="/api/campaigns", tags=["notifications"])

_SHOTS_PER_AIRFRAME = 4
_LOW_STOCK_PCT = 0.25
_EVENT_RECENCY_Q = 10  # show event-derived notifications within this many quarters


def _base_name_map(db: Session, campaign_id: int) -> dict[int, str]:
    rows = db.query(CampaignBase).filter_by(campaign_id=campaign_id).all()
    templates = bases_reg()
    out: dict[int, str] = {}
    for b in rows:
        tpl = templates.get(b.template_id)
        out[b.id] = tpl.name if tpl else b.template_id
    return out


def _weapon_capacity_at_base(
    squadrons: list[Squadron], base_id: int, weapon_id: str,
) -> int:
    """Derived 'starting capacity' = sum(strength * shots-per-airframe) for
    squadrons at this base whose loadout includes the weapon."""
    total = 0
    for sq in squadrons:
        if sq.base_id != base_id:
            continue
        ld = PLATFORM_LOADOUTS.get(sq.platform_id, {})
        weapons = list(ld.get("bvr", [])) + list(ld.get("wvr", []))
        if weapon_id in weapons:
            total += (sq.strength or 0) * _SHOTS_PER_AIRFRAME
    return total


def _synthesize(db: Session, campaign_id: int) -> list[Notification]:
    camp = get_campaign(db, campaign_id)
    if camp is None:
        return []

    warnings: list[Notification] = []
    infos: list[Notification] = []

    base_names = _base_name_map(db, campaign_id)
    squadrons = db.query(Squadron).filter_by(campaign_id=campaign_id).all()

    # 1. Low / empty missile stock
    stocks = db.query(MissileStock).filter_by(campaign_id=campaign_id).all()
    for s in stocks:
        cap = _weapon_capacity_at_base(squadrons, s.base_id, s.weapon_id)
        if cap <= 0:
            continue  # no squadron at this base uses this weapon — skip
        base = base_names.get(s.base_id, f"base-{s.base_id}")
        topup = max(20, cap - s.stock)
        topup = ((topup + 9) // 10) * 10  # round up to nearest 10
        url = (
            f"/campaign/{campaign_id}/procurement"
            f"?tab=acquisitions&view=offers&offer=missiles"
            f"&missile={s.weapon_id}&base={s.base_id}&qty={topup}"
        )
        if s.stock == 0:
            warnings.append(Notification(
                id=f"empty_stock:{s.base_id}:{s.weapon_id}",
                kind="empty_stock", severity="warning",
                title=f"{s.weapon_id.upper()} depot EMPTY at {base}",
                body=f"0 / {cap} — reorder before next engagement",
                action_url=url,
            ))
        elif s.stock < cap * _LOW_STOCK_PCT:
            warnings.append(Notification(
                id=f"low_stock:{s.base_id}:{s.weapon_id}",
                kind="low_stock", severity="warning",
                title=f"{s.weapon_id.upper()} depot low at {base}",
                body=f"{s.stock} / {cap} — reorder to top up",
                action_url=url,
            ))

    # 2. Empty AD batteries
    batteries = db.query(ADBattery).filter_by(campaign_id=campaign_id).all()
    for b in batteries:
        if (b.interceptor_stock or 0) > 0:
            continue
        base = base_names.get(b.base_id, f"base-{b.base_id}")
        url = (
            f"/campaign/{campaign_id}/procurement"
            f"?tab=acquisitions&view=offers&offer=reloads"
            f"&ad_system={b.system_id}&battery={b.id}"
        )
        warnings.append(Notification(
            id=f"empty_ad:{b.id}",
            kind="empty_ad", severity="warning",
            title=f"{b.system_id.upper()} battery at {base} has 0 interceptors",
            body="Reload via Acquisitions → AD Reloads",
            action_url=url,
        ))

    # 3. Pending vignettes
    pendings = db.query(Vignette).filter_by(
        campaign_id=campaign_id, status="pending",
    ).all()
    for v in pendings:
        ps = v.planning_state or {}
        scenario_name = ps.get("scenario_name", v.scenario_id)
        ao = (ps.get("ao") or {}).get("name", "")
        warnings.append(Notification(
            id=f"pending_vignette:{v.id}",
            kind="pending_vignette", severity="warning",
            title=f"Pending vignette: {scenario_name}",
            body=f"AO: {ao}" if ao else "Commit force via Ops Room",
            action_url=f"/campaign/{campaign_id}/vignette/{v.id}",
        ))

    # 4. Recent event-derived notifications
    now_q = camp.current_year * 4 + (camp.current_quarter - 1)
    cutoff_q = now_q - _EVENT_RECENCY_Q
    interesting_kinds = (
        "rd_completed", "acquisition_completed", "acquisition_slipped",
    )
    events = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign_id,
        CampaignEvent.event_type.in_(interesting_kinds),
    ).order_by(CampaignEvent.id.desc()).limit(50).all()

    rd_programs_reg = None  # lazy-load to avoid circular imports
    for ev in events:
        ev_q = ev.year * 4 + (ev.quarter - 1)
        if ev_q < cutoff_q:
            continue
        created_iso = f"{ev.year}-Q{ev.quarter}"

        if ev.event_type == "rd_completed":
            program_id = (ev.payload or {}).get("program_id", "")
            if rd_programs_reg is None:
                from app.content.registry import rd_programs as _reg
                rd_programs_reg = _reg()
            spec = rd_programs_reg.get(program_id)
            unlocks = getattr(spec, "unlocks", None) if spec else None
            unlock_kind = getattr(unlocks, "kind", None) if unlocks else None
            target_id = getattr(unlocks, "target_id", None) if unlocks else None

            if unlock_kind == "missile":
                url = f"/campaign/{campaign_id}/armory?tab=missiles"
            elif unlock_kind == "ad_system" and target_id:
                url = (
                    f"/campaign/{campaign_id}/procurement"
                    f"?tab=acquisitions&view=offers&offer=ad_systems"
                    f"&focus_ad={target_id}"
                )
            elif unlock_kind in ("platform", "strike_platform") and target_id:
                url = (
                    f"/campaign/{campaign_id}/procurement"
                    f"?tab=acquisitions&view=offers&offer=aircraft"
                    f"&focus={target_id}"
                )
            else:
                url = f"/campaign/{campaign_id}/armory"
            infos.append(Notification(
                id=f"event:{ev.id}",
                kind="rd_completed", severity="info",
                title=f"{spec.name if spec else program_id} R&D complete",
                body="Unlocked — procure via Acquisitions" if unlock_kind else "Doctrinal benefit applied",
                action_url=url,
                created_at=created_iso,
            ))
        elif ev.event_type == "acquisition_completed":
            pid = (ev.payload or {}).get("platform_id", "")
            infos.append(Notification(
                id=f"event:{ev.id}",
                kind="acquisition_completed", severity="info",
                title=f"Delivery complete: {pid}",
                body=f"Order {(ev.payload or {}).get('order_id')} fully delivered",
                action_url=f"/campaign/{campaign_id}/procurement?tab=acquisitions&view=orders",
                created_at=created_iso,
            ))
        elif ev.event_type == "acquisition_slipped":
            p = ev.payload or {}
            warnings.append(Notification(
                id=f"event:{ev.id}",
                kind="acquisition_slipped", severity="warning",
                title=f"Delivery slipped: {p.get('platform_id', '')}",
                body=(
                    f"Underfunded — FOC pushed to "
                    f"{p.get('new_foc_year')}-Q{p.get('new_foc_quarter')}"
                ),
                action_url=f"/campaign/{campaign_id}/procurement?tab=acquisitions&view=orders",
                created_at=created_iso,
            ))

    # 5. Sort: warnings first (by id desc for stable newest-first-ish),
    # then infos (by id desc — higher event.id = newer).
    warnings.sort(key=lambda n: n.id, reverse=True)
    infos.sort(key=lambda n: n.id, reverse=True)
    return warnings + infos


@router.get(
    "/{campaign_id}/notifications",
    response_model=NotificationListResponse,
)
def list_notifications(campaign_id: int, db: Session = Depends(get_db)):
    if get_campaign(db, campaign_id) is None:
        raise HTTPException(status_code=404, detail="Campaign not found")
    return NotificationListResponse(
        notifications=_synthesize(db, campaign_id),
    )
