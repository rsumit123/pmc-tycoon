"""Adversary base list endpoint with ISR drone coverage applied.

covered_only=true (default) returns only bases currently within a friendly
drone's orbit radius. covered_only=false returns all seeded bases regardless
of coverage — useful for debug / future fog-of-war rework.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.content.registry import (
    adversary_bases as _adv_bases_catalog,
    bases as _bases_catalog,
)
from app.engine.drone_recon import bases_covered_by_drones
from app.models.adversary_base import AdversaryBase
from app.models.campaign_base import CampaignBase
from app.models.intel import IntelCard
from app.models.squadron import Squadron
from app.schemas.adversary_base import (
    AdversaryBaseListResponse,
    AdversaryBaseRead,
    SightingRead,
)

router = APIRouter(
    prefix="/api/campaigns/{campaign_id}/adversary-bases",
    tags=["adversary-bases"],
)

_DRONE_PIDS = {"tapas_uav", "ghatak_ucav", "heron_tp", "mq9b_seaguardian"}


@router.get("", response_model=AdversaryBaseListResponse)
def list_adversary_bases(
    campaign_id: int,
    covered_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    adv_rows = (
        db.query(AdversaryBase).filter_by(campaign_id=campaign_id).all()
    )
    # Lazy backfill: campaigns created before the AdversaryBase table was
    # introduced have zero rows. Seed them on first read from the content
    # catalog so the feature works on legacy campaigns without migration.
    if not adv_rows:
        for spec in _adv_bases_catalog().values():
            db.add(AdversaryBase(
                campaign_id=campaign_id,
                base_id_str=spec.id,
                name=spec.name,
                faction=spec.faction,
                lat=spec.lat,
                lon=spec.lon,
                tier=spec.tier,
            ))
        db.commit()
        adv_rows = (
            db.query(AdversaryBase).filter_by(campaign_id=campaign_id).all()
        )
    drones = [
        {
            "id": s.id,
            "platform_id": s.platform_id,
            "base_id": s.base_id,
            "strength": s.strength,
            "readiness_pct": s.readiness_pct,
        }
        for s in db.query(Squadron).filter_by(campaign_id=campaign_id).all()
        if s.platform_id in _DRONE_PIDS
    ]

    # Friendly base lat/lon live in the content catalog (CampaignBase only
    # carries template_id + per-campaign config).
    base_templates = _bases_catalog()
    friendly_bases: dict[int, dict] = {}
    for b in db.query(CampaignBase).filter_by(campaign_id=campaign_id).all():
        tpl = base_templates.get(b.template_id)
        if tpl is None:
            continue
        friendly_bases[b.id] = {"lat": tpl.lat, "lon": tpl.lon, "name": tpl.name}

    adv_inputs = [
        {
            "id": r.id,
            "base_id_str": r.base_id_str,
            "lat": r.lat,
            "lon": r.lon,
            "faction": r.faction,
            "tier": r.tier,
        }
        for r in adv_rows
    ]
    coverage = {
        c["adversary_base_id"]: c
        for c in bases_covered_by_drones(adv_inputs, drones, friendly_bases)
    }

    # Latest drone_recon IntelCard per subject (keyed on base_id_str).
    latest_by_subject: dict[str, IntelCard] = {}
    for card in (
        db.query(IntelCard)
        .filter_by(campaign_id=campaign_id, source_type="drone_recon")
        .order_by(
            IntelCard.appeared_year.desc(),
            IntelCard.appeared_quarter.desc(),
            IntelCard.id.desc(),
        )
        .all()
    ):
        sid = (card.payload or {}).get("subject_id")
        if sid and sid not in latest_by_subject:
            latest_by_subject[sid] = card

    out: list[AdversaryBaseRead] = []
    for r in adv_rows:
        is_covered = r.id in coverage
        if covered_only and not is_covered:
            continue
        sighting = None
        card = latest_by_subject.get(r.base_id_str)
        if card is not None:
            p = card.payload or {}
            obs = p.get("observed_force", {})
            cr = obs.get("count_range")
            sighting = SightingRead(
                tier=obs.get("tier", "low"),
                year=card.appeared_year,
                quarter=card.appeared_quarter,
                count_range=(cr[0], cr[1]) if cr else None,
                platforms=obs.get("platforms"),
                platforms_detailed=obs.get("platforms_detailed"),
                readiness=obs.get("readiness"),
                covering_drones=p.get("covering_drones", []),
            )
        out.append(AdversaryBaseRead(
            id=r.id,
            base_id_str=r.base_id_str,
            name=r.name,
            faction=r.faction,
            lat=r.lat,
            lon=r.lon,
            tier=r.tier,
            is_covered=is_covered,
            latest_sighting=sighting,
        ))
    return AdversaryBaseListResponse(bases=out)
