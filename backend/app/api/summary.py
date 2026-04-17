from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.models.campaign_narrative import CampaignNarrative
from app.models.event import CampaignEvent
from app.models.rd_program import RDProgramState
from app.models.vignette import Vignette
from app.models.squadron import Squadron
from app.schemas.summary import (
    CampaignSummaryResponse, YearSnapshot, ForceStructure, AceSummary,
    ObjectiveResult,
)

router = APIRouter(prefix="/api/campaigns", tags=["summary"])


def _year_snapshots(db: Session, campaign_id: int) -> list[YearSnapshot]:
    rows = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign_id,
        CampaignEvent.event_type == "turn_advanced",
    ).order_by(CampaignEvent.year, CampaignEvent.quarter).all()

    years: dict[int, dict] = {}
    for r in rows:
        y = r.year
        if y not in years:
            years[y] = {"end_treasury_cr": 0, "vignettes_resolved": 0,
                        "vignettes_won": 0, "deliveries": 0, "rd_completions": 0}
        years[y]["end_treasury_cr"] = r.payload.get("treasury_after_cr", 0)

    delivery_rows = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign_id,
        CampaignEvent.event_type == "acquisition_delivery",
    ).all()
    for r in delivery_rows:
        if r.year in years:
            years[r.year]["deliveries"] += 1

    rd_rows = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign_id,
        CampaignEvent.event_type == "rd_completed",
    ).all()
    for r in rd_rows:
        if r.year in years:
            years[r.year]["rd_completions"] += 1

    vigs = db.query(Vignette).filter(
        Vignette.campaign_id == campaign_id,
        Vignette.status == "resolved",
    ).all()
    for v in vigs:
        if v.year in years:
            years[v.year]["vignettes_resolved"] += 1
            if (v.outcome or {}).get("objective_met"):
                years[v.year]["vignettes_won"] += 1

    return [
        YearSnapshot(year=y, **d)
        for y, d in sorted(years.items())
    ]


def _force_structure(db: Session, campaign_id: int) -> ForceStructure:
    squads = db.query(Squadron).filter(
        Squadron.campaign_id == campaign_id).all()
    fifth_gen = sum(1 for s in squads if s.platform_id in (
        "amca_mk1", "amca_mk2"))
    return ForceStructure(
        squadrons_end=len(squads),
        total_airframes=sum(s.strength for s in squads),
        fifth_gen_squadrons=fifth_gen,
    )


def _aces(db: Session, campaign_id: int) -> list[AceSummary]:
    rows = db.query(Squadron).filter(
        Squadron.campaign_id == campaign_id,
        Squadron.ace_name.isnot(None),
    ).all()
    return [
        AceSummary(
            squadron_id=s.id, squadron_name=s.name,
            platform_id=s.platform_id, ace_name=s.ace_name,
            awarded_year=s.ace_awarded_year,
            awarded_quarter=s.ace_awarded_quarter,
        )
        for s in rows
    ]


_INDIGENOUS_PLATFORMS = {
    "tejas_mk1", "tejas_mk1a", "tejas_mk2", "amca_mk1", "tedbf", "ghatak_ucav",
}

_DETERRENCE_PROGRAMS = {
    "astra_mk3", "brahmos_ng", "rudram_2", "rudram_3", "pralay_srbm",
    "long_range_sam", "maya_ew", "ngarm", "air_brahmos2", "mrsam_air", "saaw",
}


def _evaluate_objective(obj_id: str, campaign, squads, vigs, db: Session) -> str:
    if obj_id == "amca_operational_by_2035":
        has_amca = any(s.platform_id in ("amca_mk1", "amca_mk2") for s in squads)
        return "pass" if has_amca else "fail"

    elif obj_id == "maintain_42_squadrons":
        return "pass" if len(squads) >= 42 else "fail"

    elif obj_id == "no_territorial_loss":
        lost = any(not (v.outcome or {}).get("objective_met") for v in vigs)
        return "fail" if lost else "pass"

    elif obj_id == "modernize_fleet":
        from app.content import registry
        plat_map = registry.platforms()
        if not squads:
            return "fail"
        modern = sum(
            1 for s in squads
            if float(plat_map[s.platform_id].generation) >= 4.5
            if s.platform_id in plat_map
        )
        return "pass" if modern / len(squads) > 0.50 else "fail"

    elif obj_id == "indigenous_backbone":
        count = sum(1 for s in squads if s.platform_id in _INDIGENOUS_PLATFORMS)
        return "pass" if count >= 5 else "fail"

    elif obj_id == "missile_sovereignty":
        completed = {
            r.program_id
            for r in db.query(RDProgramState).filter(
                RDProgramState.campaign_id == campaign.id,
                RDProgramState.status == "completed",
            ).all()
        }
        return "pass" if {"astra_mk3", "brahmos_ng"}.issubset(completed) else "fail"

    elif obj_id == "maritime_reach":
        completed = db.query(RDProgramState).filter(
            RDProgramState.campaign_id == campaign.id,
            RDProgramState.program_id == "tedbf",
            RDProgramState.status == "completed",
        ).first()
        return "pass" if completed is not None else "fail"

    elif obj_id == "budget_discipline":
        return "pass" if campaign.budget_cr > 0 else "fail"

    elif obj_id == "combat_excellence":
        if not vigs:
            return "fail"
        won = sum(1 for v in vigs if (v.outcome or {}).get("objective_met"))
        return "pass" if won / len(vigs) > 0.65 else "fail"

    elif obj_id == "stealth_fleet":
        from app.content import registry
        plat_map = registry.platforms()
        vlo_count = sum(
            1 for s in squads
            if s.platform_id in plat_map
            and plat_map[s.platform_id].rcs_band == "VLO"
        )
        return "pass" if vlo_count >= 2 else "fail"

    elif obj_id == "ace_squadrons":
        count = db.query(CampaignNarrative).filter(
            CampaignNarrative.campaign_id == campaign.id,
            CampaignNarrative.kind == "ace_name",
        ).count()
        return "pass" if count >= 3 else "fail"

    elif obj_id == "deterrence_posture":
        completed = {
            r.program_id
            for r in db.query(RDProgramState).filter(
                RDProgramState.campaign_id == campaign.id,
                RDProgramState.status == "completed",
                RDProgramState.program_id.in_(list(_DETERRENCE_PROGRAMS)),
            ).all()
        }
        return "pass" if len(completed) >= 4 else "fail"

    return "unknown"


def _objectives(db: Session, campaign, squads, vigs) -> list[ObjectiveResult]:
    from app.content.registry import objectives as objectives_reg
    obj_specs = objectives_reg()
    results = []
    for obj_id in (campaign.objectives_json or []):
        spec = obj_specs.get(obj_id)
        name = spec.title if spec else obj_id.replace("_", " ")
        status = _evaluate_objective(obj_id, campaign, squads, vigs, db)
        results.append(ObjectiveResult(id=obj_id, name=name, status=status))
    return results


def _is_complete(campaign) -> bool:
    return campaign.current_year > 2036 or (
        campaign.current_year == 2036 and campaign.current_quarter > 1
    )


@router.get("/{campaign_id}/summary", response_model=CampaignSummaryResponse)
def summary_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")

    snapshots = _year_snapshots(db, campaign_id)
    force = _force_structure(db, campaign_id)
    aces = _aces(db, campaign_id)

    vigs = db.query(Vignette).filter(
        Vignette.campaign_id == campaign_id,
        Vignette.status == "resolved",
    ).all()
    won = sum(1 for v in vigs if (v.outcome or {}).get("objective_met"))
    lost = len(vigs) - won

    squads = db.query(Squadron).filter(
        Squadron.campaign_id == campaign_id).all()
    objectives = _objectives(db, c, squads, vigs)

    return CampaignSummaryResponse(
        campaign_id=c.id, name=c.name, difficulty=c.difficulty,
        starting_year=c.starting_year,
        current_year=c.current_year, current_quarter=c.current_quarter,
        budget_cr=c.budget_cr, reputation=c.reputation,
        year_snapshots=snapshots,
        force_structure=force,
        vignettes_won=won, vignettes_lost=lost, vignettes_total=len(vigs),
        ace_count=len(aces), aces=aces,
        objectives=objectives,
        is_complete=_is_complete(c),
    )
