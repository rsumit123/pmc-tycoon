from pydantic import BaseModel


class TreasurySnap(BaseModel):
    treasury_cr: int
    quarterly_grant_cr: int
    runway_quarters: int


class FleetSummaryEntry(BaseModel):
    role: str
    airframes: int
    avg_readiness_pct: int


class PostureResponse(BaseModel):
    treasury: TreasurySnap
    fleet_by_role: list[FleetSummaryEntry]
    threat_history_by_faction: dict[str, list[float]]
    total_active_orders: int
    nearest_delivery: dict | None
    rd_active_count: int
    rd_completed_count: int
    diplomacy_summary: dict[str, str]
    offensive_unlocked: bool
    strikes_this_quarter: int
