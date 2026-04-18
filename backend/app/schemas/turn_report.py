from pydantic import BaseModel


class RawEvent(BaseModel):
    event_type: str
    payload: dict


class DeliverySummary(BaseModel):
    order_id: int
    platform_id: str
    count: int
    cost_cr: int
    assigned_base_id: int | None = None
    assigned_squadron_id: int | None = None


class RDMilestoneSummary(BaseModel):
    program_id: str
    kind: str  # "breakthrough" | "setback" | "milestone" | "completed" | "underfunded"
    progress_pct: int | None = None


class VignetteFiredSummary(BaseModel):
    scenario_id: str
    scenario_name: str
    ao: dict


class IntelCardSummary(BaseModel):
    source_type: str
    confidence: float
    headline: str


class TurnReportResponse(BaseModel):
    campaign_id: int
    year: int
    quarter: int
    events: list[RawEvent]
    deliveries: list[DeliverySummary]
    rd_milestones: list[RDMilestoneSummary]
    adversary_shifts: list[dict]
    intel_cards: list[IntelCardSummary]
    vignette_fired: VignetteFiredSummary | None
    treasury_after_cr: int
    allocation: dict | None
