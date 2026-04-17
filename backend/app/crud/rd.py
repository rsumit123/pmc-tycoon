from sqlalchemy.orm import Session

from app.models.rd_program import RDProgramState
from app.content.registry import rd_programs


class ProgramNotFound(Exception):
    pass


class ProgramAlreadyActive(Exception):
    pass


def start_program(db: Session, campaign_id: int, program_id: str, funding_level: str) -> RDProgramState:
    if program_id not in rd_programs():
        raise ProgramNotFound(program_id)
    existing = db.query(RDProgramState).filter(
        RDProgramState.campaign_id == campaign_id,
        RDProgramState.program_id == program_id,
        RDProgramState.status != "cancelled",
    ).first()
    if existing is not None:
        raise ProgramAlreadyActive(program_id)
    state = RDProgramState(
        campaign_id=campaign_id,
        program_id=program_id,
        progress_pct=0,
        funding_level=funding_level,
        status="active",
        milestones_hit=[],
        cost_invested_cr=0,
        quarters_active=0,
    )
    db.add(state)
    db.commit()
    db.refresh(state)
    return state


def update_program(
    db: Session,
    campaign_id: int,
    program_id: str,
    funding_level: str | None = None,
    status: str | None = None,
) -> RDProgramState:
    state = db.query(RDProgramState).filter(
        RDProgramState.campaign_id == campaign_id,
        RDProgramState.program_id == program_id,
    ).first()
    if state is None:
        raise ProgramNotFound(program_id)
    if funding_level is not None:
        state.funding_level = funding_level
    if status is not None:
        state.status = status
    db.commit()
    db.refresh(state)
    return state


def list_active_programs(db: Session, campaign_id: int):
    """Return ALL RDProgramState rows for a campaign (active, completed,
    and cancelled). Name is a historical artifact — we want the full state
    so the frontend can render status badges."""
    return db.query(RDProgramState).filter(
        RDProgramState.campaign_id == campaign_id
    ).order_by(RDProgramState.id.asc()).all()
