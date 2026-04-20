from pydantic import BaseModel


class CampaignTotals(BaseModel):
    total_sorties: int
    total_kills: int
    total_losses: int
    total_munitions_cost_cr: int
    avg_cost_per_kill_cr: int | None


class FactionStat(BaseModel):
    faction: str
    sorties: int
    wins: int
    losses: int
    win_rate_pct: int
    avg_exchange_ratio: float | None
    avg_munitions_cost_cr: int


class PlatformStat(BaseModel):
    platform_id: str
    platform_name: str
    sorties: int
    kills: int
    losses: int
    kd_ratio: float | None
    win_contribution_pct: int
    first_shot_pct: int
    top_weapon: str | None


class WeaponStat(BaseModel):
    weapon_id: str
    fired: int
    hits: int
    hit_rate_pct: int
    avg_pk: float
    total_cost_cr: int
    cost_per_kill_cr: int | None
    top_target_platform: str | None
    weapon_class: str


class SupportStat(BaseModel):
    asset: str
    with_sorties: int
    without_sorties: int
    with_win_rate_pct: int
    without_win_rate_pct: int
    delta_win_rate_pp: int


class PerformanceResponse(BaseModel):
    totals: CampaignTotals
    factions: list[FactionStat]
    platforms: list[PlatformStat]
    weapons: list[WeaponStat]
    support: list[SupportStat]
