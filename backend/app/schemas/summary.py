from pydantic import BaseModel


class YearSnapshot(BaseModel):
    year: int
    end_treasury_cr: int
    vignettes_resolved: int
    vignettes_won: int
    deliveries: int
    rd_completions: int


class ForceStructure(BaseModel):
    squadrons_end: int
    total_airframes: int
    fifth_gen_squadrons: int


class AceSummary(BaseModel):
    squadron_id: int
    squadron_name: str
    platform_id: str
    ace_name: str
    awarded_year: int
    awarded_quarter: int


class ObjectiveResult(BaseModel):
    id: str
    name: str
    status: str  # "pass" | "fail" | "unknown"


class CampaignSummaryResponse(BaseModel):
    campaign_id: int
    name: str
    difficulty: str
    starting_year: int
    current_year: int
    current_quarter: int
    budget_cr: int
    reputation: int
    year_snapshots: list[YearSnapshot]
    force_structure: ForceStructure
    vignettes_won: int
    vignettes_lost: int
    vignettes_total: int
    ace_count: int
    aces: list[AceSummary]
    objectives: list[ObjectiveResult]
    is_complete: bool
