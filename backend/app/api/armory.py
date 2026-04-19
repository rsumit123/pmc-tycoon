from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.schemas.armory import (
    UnlocksResponse, MissileUnlock, ADSystemUnlock, ISRDroneUnlock, StrikePlatformUnlock,
    EquipMissileRequest, LoadoutUpgradeRead,
    InstallADRequest, ADBatteryRead,
    HangarResponse, HangarSquadron, HangarPlatformSummary, PendingLoadoutUpgrade,
)

router = APIRouter(prefix="/api/campaigns/{campaign_id}/armory", tags=["armory"])


def _completed_unlocks(db: Session, campaign_id: int) -> dict[str, list]:
    from app.models.rd_program import RDProgramState
    from app.content.registry import rd_programs, ad_systems as _ad_systems
    from app.engine.vignette.bvr import WEAPONS

    rd_specs = rd_programs()
    ad_specs = _ad_systems()

    completed_rows = db.query(RDProgramState).filter_by(
        campaign_id=campaign_id, status="completed",
    ).all()

    missiles: list[MissileUnlock] = []
    ads: list[ADSystemUnlock] = []
    isrs: list[ISRDroneUnlock] = []
    strikes: list[StrikePlatformUnlock] = []

    for cs in completed_rows:
        spec = rd_specs.get(cs.program_id)
        if spec is None:
            continue
        u = spec.unlocks
        if u is None or u.kind == "none":
            continue
        if u.kind == "missile" and u.target_id in WEAPONS:
            w = WEAPONS[u.target_id]
            missiles.append(MissileUnlock(
                target_id=u.target_id,
                name=u.target_id.upper(),
                description=u.description,
                eligible_platforms=u.eligible_platforms,
                nez_km=w["nez_km"],
                max_range_km=w["max_range_km"],
            ))
        elif u.kind == "ad_system":
            adspec = ad_specs.get(u.target_id)
            if adspec is None:
                continue
            ads.append(ADSystemUnlock(
                target_id=u.target_id,
                name=adspec.name,
                description=adspec.description,
                coverage_km=adspec.coverage_km,
                install_cost_cr=adspec.install_cost_cr,
                max_pk=adspec.max_pk,
            ))
        elif u.kind == "isr_drone":
            isrs.append(ISRDroneUnlock(
                target_id=u.target_id,
                name=u.target_id,
                description=u.description,
                coverage_km=u.coverage_km or 0,
            ))
        elif u.kind == "strike_platform":
            strikes.append(StrikePlatformUnlock(
                target_id=u.target_id,
                name=u.target_id,
                description=u.description,
            ))

    return {"missiles": missiles, "ad_systems": ads, "isr_drones": isrs, "strike_platforms": strikes}


@router.get("/unlocks", response_model=UnlocksResponse)
def list_unlocks(campaign_id: int, db: Session = Depends(get_db)):
    return UnlocksResponse(**_completed_unlocks(db, campaign_id))


@router.post("/missiles/{missile_id}/equip", response_model=LoadoutUpgradeRead,
             status_code=status.HTTP_200_OK)
def equip_missile(
    campaign_id: int,
    missile_id: str,
    payload: EquipMissileRequest,
    db: Session = Depends(get_db),
):
    from app.models.loadout_upgrade import LoadoutUpgrade
    from app.models.squadron import Squadron
    from app.models.campaign import Campaign
    from app.content.registry import rd_programs
    from app.engine.vignette.bvr import PLATFORM_LOADOUTS

    unlocks = _completed_unlocks(db, campaign_id)
    if not any(m.target_id == missile_id for m in unlocks["missiles"]):
        raise HTTPException(status.HTTP_409_CONFLICT, f"missile {missile_id} not unlocked")

    # Find the unlock spec for eligible_platforms
    rd_specs = rd_programs()
    unlock_spec = None
    for pid, rd_spec in rd_specs.items():
        if (
            rd_spec.unlocks
            and rd_spec.unlocks.kind == "missile"
            and rd_spec.unlocks.target_id == missile_id
        ):
            unlock_spec = rd_spec.unlocks
            break
    if unlock_spec is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "unlock spec not found")

    sq = db.query(Squadron).filter_by(id=payload.squadron_id, campaign_id=campaign_id).first()
    if sq is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "squadron not found")
    if sq.platform_id not in unlock_spec.eligible_platforms:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{sq.platform_id} is not eligible for {missile_id}",
        )

    # Prevent duplicate pending upgrades for same (squadron, missile)
    existing = db.query(LoadoutUpgrade).filter_by(
        campaign_id=campaign_id,
        squadron_id=payload.squadron_id,
        weapon_id=missile_id,
        status="pending",
    ).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "upgrade already in progress for this squadron")

    camp = db.get(Campaign, campaign_id)
    if camp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "campaign not found")

    # Rollout: 3 quarters from current turn
    total_q = camp.current_year * 4 + (camp.current_quarter - 1) + 3
    comp_year = total_q // 4
    comp_q = (total_q % 4) + 1

    base_loadout = sq.loadout_override_json or (
        list(PLATFORM_LOADOUTS.get(sq.platform_id, {}).get("bvr", []))
        + list(PLATFORM_LOADOUTS.get(sq.platform_id, {}).get("wvr", []))
    )

    row = LoadoutUpgrade(
        campaign_id=campaign_id,
        squadron_id=payload.squadron_id,
        weapon_id=missile_id,
        base_loadout=list(base_loadout),
        completion_year=comp_year,
        completion_quarter=comp_q,
        status="pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post("/ad-systems/{system_id}/install", response_model=ADBatteryRead,
             status_code=status.HTTP_200_OK)
def install_ad_system(
    campaign_id: int,
    system_id: str,
    payload: InstallADRequest,
    db: Session = Depends(get_db),
):
    from app.models.ad_battery import ADBattery
    from app.models.campaign_base import CampaignBase
    from app.models.campaign import Campaign
    from app.content.registry import ad_systems as _ad_systems

    unlocks = _completed_unlocks(db, campaign_id)
    if not any(a.target_id == system_id for a in unlocks["ad_systems"]):
        raise HTTPException(status.HTTP_409_CONFLICT, f"AD system {system_id} not unlocked")

    adspec = _ad_systems().get(system_id)
    if adspec is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"AD system {system_id} not in catalog")

    base = db.query(CampaignBase).filter_by(id=payload.base_id, campaign_id=campaign_id).first()
    if base is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "base not found")

    camp = db.get(Campaign, campaign_id)
    if camp is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "campaign not found")

    if camp.budget_cr < adspec.install_cost_cr:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            f"insufficient budget: need {adspec.install_cost_cr} cr",
        )

    camp.budget_cr -= adspec.install_cost_cr

    row = ADBattery(
        campaign_id=campaign_id,
        base_id=payload.base_id,
        system_id=system_id,
        coverage_km=adspec.coverage_km,
        installed_year=camp.current_year,
        installed_quarter=camp.current_quarter,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


hangar_router = APIRouter(prefix="/api/campaigns/{campaign_id}", tags=["hangar"])


@hangar_router.get("/hangar", response_model=HangarResponse)
def get_hangar(campaign_id: int, db: Session = Depends(get_db)):
    from app.models.squadron import Squadron
    from app.models.campaign_base import CampaignBase
    from app.content.registry import platforms, bases as base_specs
    from app.engine.vignette.bvr import PLATFORM_LOADOUTS

    from app.models.loadout_upgrade import LoadoutUpgrade
    plat_specs = platforms()
    base_specs_dict = base_specs()
    base_rows = db.query(CampaignBase).filter_by(campaign_id=campaign_id).all()
    bases = {b.id: b for b in base_rows}
    sqns = db.query(Squadron).filter_by(campaign_id=campaign_id).all()

    # Pending upgrades grouped by squadron_id
    pending_rows = db.query(LoadoutUpgrade).filter_by(
        campaign_id=campaign_id, status="pending",
    ).all()
    pending_by_sqid: dict[int, list] = {}
    for p in pending_rows:
        pending_by_sqid.setdefault(p.squadron_id, []).append(
            PendingLoadoutUpgrade(
                weapon_id=p.weapon_id,
                completion_year=p.completion_year,
                completion_quarter=p.completion_quarter,
            )
        )

    squadron_dtos: list[HangarSquadron] = []
    by_plat: dict[str, list] = {}
    for s in sqns:
        plat = plat_specs.get(s.platform_id)
        plat_name = plat.name if plat else s.platform_id
        base = bases.get(s.base_id)
        base_name = "unknown"
        if base:
            base_spec = base_specs_dict.get(base.template_id)
            base_name = base_spec.name if base_spec else base.template_id
        loadout = s.loadout_override_json or (
            list(PLATFORM_LOADOUTS.get(s.platform_id, {}).get("bvr", []))
            + list(PLATFORM_LOADOUTS.get(s.platform_id, {}).get("wvr", []))
        )
        squadron_dtos.append(HangarSquadron(
            id=s.id, name=s.name, call_sign=s.call_sign,
            platform_id=s.platform_id, platform_name=plat_name,
            base_id=s.base_id, base_name=base_name,
            strength=s.strength, readiness_pct=s.readiness_pct,
            xp=s.xp, ace_name=s.ace_name, loadout=list(loadout),
            pending_upgrades=pending_by_sqid.get(s.id, []),
        ))
        by_plat.setdefault(s.platform_id, []).append(s)

    summary: list[HangarPlatformSummary] = []
    for pid, group in by_plat.items():
        plat = plat_specs.get(pid)
        summary.append(HangarPlatformSummary(
            platform_id=pid,
            platform_name=plat.name if plat else pid,
            squadron_count=len(group),
            total_airframes=sum(g.strength for g in group),
            avg_readiness_pct=int(sum(g.readiness_pct for g in group) / len(group)),
        ))
    summary.sort(key=lambda x: -x.total_airframes)

    return HangarResponse(squadrons=squadron_dtos, summary_by_platform=summary)
