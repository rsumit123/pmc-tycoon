from fastapi import APIRouter

from app.content.registry import platforms as platforms_reg
from app.content.registry import rd_programs as rd_programs_reg
from app.content.registry import objectives as objectives_reg
from app.schemas.content import PlatformOut, PlatformListResponse
from app.schemas.content import RDProgramSpecOut, RDProgramSpecListResponse, UnlockSpecOut
from app.schemas.content import ObjectiveOut, ObjectiveListResponse

router = APIRouter(prefix="/api/content", tags=["content"])


@router.get("/platforms", response_model=PlatformListResponse)
def list_platforms_endpoint():
    registry = platforms_reg()
    out: list[PlatformOut] = []
    for spec in registry.values():
        out.append(PlatformOut(
            id=spec.id,
            name=spec.name,
            origin=spec.origin,
            role=spec.role,
            generation=str(spec.generation),
            combat_radius_km=int(spec.combat_radius_km),
            payload_kg=int(spec.payload_kg),
            rcs_band=spec.rcs_band,
            radar_range_km=int(spec.radar_range_km),
            cost_cr=int(spec.cost_cr),
            intro_year=int(spec.intro_year),
            procurable_by=list(getattr(spec, "procurable_by", []) or []),
            default_first_delivery_quarters=int(getattr(spec, "default_first_delivery_quarters", 8) or 8),
            default_foc_quarters=int(getattr(spec, "default_foc_quarters", 20) or 20),
            runway_class=getattr(spec, "runway_class", "standard") or "standard",
        ))
    out.sort(key=lambda p: p.id)
    return PlatformListResponse(platforms=out)


@router.get("/rd-programs", response_model=RDProgramSpecListResponse)
def list_rd_programs_endpoint():
    registry = rd_programs_reg()
    out: list[RDProgramSpecOut] = []
    for spec in registry.values():
        u = getattr(spec, "unlocks", None)
        unlocks_out = UnlockSpecOut(
            kind=getattr(u, "kind", "none") if u else "none",
            target_id=getattr(u, "target_id", None) if u else None,
            eligible_platforms=list(getattr(u, "eligible_platforms", []) or []) if u else [],
            coverage_km=getattr(u, "coverage_km", None) if u else None,
            description=getattr(u, "description", "") if u else "",
        )
        out.append(RDProgramSpecOut(
            id=spec.id,
            name=spec.name,
            description=spec.description,
            base_duration_quarters=int(spec.base_duration_quarters),
            base_cost_cr=int(spec.base_cost_cr),
            dependencies=list(spec.dependencies),
            unlocks=unlocks_out,
        ))
    out.sort(key=lambda p: p.id)
    return RDProgramSpecListResponse(programs=out)


@router.get("/objectives", response_model=ObjectiveListResponse)
def list_objectives_endpoint():
    registry = objectives_reg()
    out: list[ObjectiveOut] = []
    for spec in registry.values():
        out.append(ObjectiveOut(
            id=spec.id,
            title=spec.title,
            description=spec.description,
            weight=int(spec.weight),
            target_year=spec.target_year,
        ))
    out.sort(key=lambda o: o.id)
    return ObjectiveListResponse(objectives=out)
