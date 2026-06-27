from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.models.campaign_narrative import CampaignNarrative
from app.models.rd_program import RDProgramState
from app.models.squadron import Squadron
from app.models.vignette import Vignette
from app.engine.objectives import (
    ObjectiveInputs, objective_progress,
    INDIGENOUS_PLATFORMS, DETERRENCE_PROGRAMS,
)
from app.schemas.objectives import ObjectiveProgressEntry, ObjectiveProgressListResponse

router = APIRouter(prefix="/api/campaigns", tags=["objectives"])


@router.get("/{campaign_id}/objectives", response_model=ObjectiveProgressListResponse)
def objectives_progress_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")

    from app.content import registry
    from app.content.registry import objectives as objectives_reg
    plat_map = registry.platforms()
    obj_specs = objectives_reg()

    squads = db.query(Squadron).filter(Squadron.campaign_id == campaign_id).all()
    vigs = db.query(Vignette).filter(
        Vignette.campaign_id == campaign_id, Vignette.status == "resolved",
    ).all()
    rd_states = db.query(RDProgramState).filter(
        RDProgramState.campaign_id == campaign_id).all()
    rd_by_id = {r.program_id: r for r in rd_states}
    completed_ids = {r.program_id for r in rd_states if r.status == "completed"}
    ace_count = db.query(CampaignNarrative).filter(
        CampaignNarrative.campaign_id == campaign_id,
        CampaignNarrative.kind == "ace_name",
    ).count()

    def rd_progress(pid: str) -> float:
        if pid in completed_ids:
            return 1.0
        r = rd_by_id.get(pid)
        return (r.progress_pct / 100.0) if r else 0.0

    total = len(squads)
    modern = sum(
        1 for s in squads
        if s.platform_id in plat_map and float(plat_map[s.platform_id].generation) >= 4.5
    )
    vlo = sum(
        1 for s in squads
        if s.platform_id in plat_map and plat_map[s.platform_id].rcs_band == "VLO"
    )
    indigenous = sum(1 for s in squads if s.platform_id in INDIGENOUS_PLATFORMS)
    won = sum(1 for v in vigs if (v.outcome or {}).get("objective_met"))

    inputs = ObjectiveInputs(
        squad_count=total,
        modern_frac=(modern / total) if total else 0.0,
        indigenous_count=indigenous,
        vlo_count=vlo,
        has_amca_squadron=any(s.platform_id in ("amca_mk1", "amca_mk2") for s in squads),
        amca_rd_progress=rd_progress("amca_mk1"),
        tedbf_completed=("tedbf" in completed_ids),
        tedbf_rd_progress=rd_progress("tedbf"),
        missile_sov_completed=len({"astra_mk3", "brahmos_ng"} & completed_ids),
        deterrence_completed=len(DETERRENCE_PROGRAMS & completed_ids),
        ace_count=ace_count,
        treasury_cr=c.budget_cr,
        vignettes_won=won,
        vignettes_total=len(vigs),
    )

    out = []
    for obj_id in (c.objectives_json or []):
        spec = obj_specs.get(obj_id)
        name = spec.title if spec else obj_id.replace("_", " ")
        p = objective_progress(obj_id, inputs)
        out.append(ObjectiveProgressEntry(
            id=obj_id, name=name, status=p.status, progress=p.progress, detail=p.detail))
    return ObjectiveProgressListResponse(objectives=out)
