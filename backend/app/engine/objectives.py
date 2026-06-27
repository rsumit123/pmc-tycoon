"""Pure per-objective progress evaluation for the live tracker.

Takes already-derived metrics (no DB/content access) so it stays a pure,
deterministic engine function. The API layer assembles ObjectiveInputs.
Constants mirror app/api/summary.py::_evaluate_objective (left untouched).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ObjectiveStatus = Literal["met", "in_progress", "at_risk"]

INDIGENOUS_PLATFORMS = {
    "tejas_mk1", "tejas_mk1a", "tejas_mk2", "amca_mk1", "tedbf", "ghatak_ucav",
}
DETERRENCE_PROGRAMS = {
    "astra_mk3", "brahmos_ng", "rudram_2", "rudram_3", "pralay_srbm",
    "long_range_sam", "maya_ew", "ngarm", "air_brahmos2", "mrsam_air", "saaw",
}


@dataclass(frozen=True)
class ObjectiveInputs:
    squad_count: int
    modern_frac: float
    indigenous_count: int
    vlo_count: int
    has_amca_squadron: bool
    amca_rd_progress: float
    tedbf_completed: bool
    tedbf_rd_progress: float
    missile_sov_completed: int
    deterrence_completed: int
    ace_count: int
    treasury_cr: int
    vignettes_won: int
    vignettes_total: int


@dataclass(frozen=True)
class ObjectiveProgress:
    status: ObjectiveStatus
    progress: float
    detail: str


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _pct(x: float) -> int:
    return int(round(_clamp01(x) * 100))


def objective_progress(obj_id: str, i: ObjectiveInputs) -> ObjectiveProgress:
    if obj_id == "maintain_42_squadrons":
        met = i.squad_count >= 42
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.squad_count / 42), f"{i.squad_count}/42 squadrons")

    if obj_id == "amca_operational_by_2035":
        if i.has_amca_squadron:
            return ObjectiveProgress("met", 1.0, "AMCA squadron operational")
        return ObjectiveProgress("in_progress", _clamp01(i.amca_rd_progress),
                                 f"AMCA R&D {_pct(i.amca_rd_progress)}%")

    if obj_id == "modernize_fleet":
        met = i.modern_frac > 0.5
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.modern_frac), f"{_pct(i.modern_frac)}% 4.5-gen+")

    if obj_id == "indigenous_backbone":
        met = i.indigenous_count >= 5
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.indigenous_count / 5), f"{i.indigenous_count}/5 indigenous sqns")

    if obj_id == "missile_sovereignty":
        met = i.missile_sov_completed >= 2
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.missile_sov_completed / 2), f"{i.missile_sov_completed}/2 programs")

    if obj_id == "maritime_reach":
        if i.tedbf_completed:
            return ObjectiveProgress("met", 1.0, "TEDBF complete")
        return ObjectiveProgress("in_progress", _clamp01(i.tedbf_rd_progress),
                                 f"TEDBF R&D {_pct(i.tedbf_rd_progress)}%")

    if obj_id == "stealth_fleet":
        met = i.vlo_count >= 2
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.vlo_count / 2), f"{i.vlo_count}/2 stealth sqns")

    if obj_id == "ace_squadrons":
        met = i.ace_count >= 3
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.ace_count / 3), f"{i.ace_count}/3 aces")

    if obj_id == "deterrence_posture":
        met = i.deterrence_completed >= 4
        return ObjectiveProgress("met" if met else "in_progress",
                                 _clamp01(i.deterrence_completed / 4), f"{i.deterrence_completed}/4 R&D programs")

    if obj_id == "budget_discipline":
        if i.treasury_cr > 0:
            return ObjectiveProgress("met", 1.0, f"₹{i.treasury_cr:,} cr treasury")
        return ObjectiveProgress("at_risk", 0.0, "Treasury depleted")

    if obj_id == "combat_excellence":
        if i.vignettes_total == 0:
            return ObjectiveProgress("in_progress", 0.0, "No engagements yet")
        rate = i.vignettes_won / i.vignettes_total
        detail = f"{i.vignettes_won}/{i.vignettes_total} won ({_pct(rate)}%)"
        if rate > 0.65:
            return ObjectiveProgress("met", _clamp01(rate), detail)
        if rate < 0.5 and i.vignettes_total >= 5:
            return ObjectiveProgress("at_risk", _clamp01(rate), detail)
        return ObjectiveProgress("in_progress", _clamp01(rate), detail)

    if obj_id == "no_territorial_loss":
        lost = i.vignettes_total - i.vignettes_won
        if lost > 0:
            rate = i.vignettes_won / i.vignettes_total if i.vignettes_total else 1.0
            return ObjectiveProgress("at_risk", _clamp01(rate), f"{lost} losses")
        return ObjectiveProgress("met", 1.0, "No losses")

    return ObjectiveProgress("in_progress", 0.0, "")
