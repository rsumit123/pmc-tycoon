from fastapi import APIRouter

from app.content.registry import platforms as platforms_reg
from app.content.registry import rd_programs as rd_programs_reg
from app.schemas.content import PlatformOut, PlatformListResponse
from app.schemas.content import RDProgramSpecOut, RDProgramSpecListResponse

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
        ))
    out.sort(key=lambda p: p.id)
    return PlatformListResponse(platforms=out)


@router.get("/rd-programs", response_model=RDProgramSpecListResponse)
def list_rd_programs_endpoint():
    registry = rd_programs_reg()
    out: list[RDProgramSpecOut] = []
    for spec in registry.values():
        out.append(RDProgramSpecOut(
            id=spec.id,
            name=spec.name,
            description=spec.description,
            base_duration_quarters=int(spec.base_duration_quarters),
            base_cost_cr=int(spec.base_cost_cr),
            dependencies=list(spec.dependencies),
        ))
    out.sort(key=lambda p: p.id)
    return RDProgramSpecListResponse(programs=out)
