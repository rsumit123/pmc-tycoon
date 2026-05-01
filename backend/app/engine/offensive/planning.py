"""Pre-commit strike validation + range forecasts.

Pure functions — no DB access, no RNG. Forecast ranges driven by intel
quality (low/medium/high) which the API layer derives from drone recon
fidelity on the target base.
"""
from __future__ import annotations
from typing import Any

from app.content.registry import strike_profiles


def validate_strike_package(
    package: dict[str, Any],
    target: dict[str, Any],
    weapons_avail: dict[str, int],
) -> list[str]:
    issues: list[str] = []
    profile_id = package.get("profile")
    profiles = strike_profiles()
    profile = profiles.get(profile_id)
    if profile is None:
        return [f"Unknown profile: {profile_id}"]

    squadrons = package.get("squadrons", [])
    if len(squadrons) < profile.requires_min_squadrons:
        issues.append(
            f"{profile.name} requires at least {profile.requires_min_squadrons} squadrons "
            f"(provided {len(squadrons)})."
        )

    if profile.eligible_squadron_roles:
        for sq in squadrons:
            if sq.get("role") not in profile.eligible_squadron_roles:
                issues.append(
                    f"Squadron {sq.get('id')} role={sq.get('role')} not eligible for {profile.name}."
                )

    weapons_planned = package.get("weapons_planned", {})
    for wid, qty in weapons_planned.items():
        if weapons_avail.get(wid, 0) < qty:
            issues.append(
                f"Insufficient {wid} at launch base — have {weapons_avail.get(wid, 0)}, need {qty}."
            )

    return issues


_INTEL_RANGE_WIDTHS = {"high": 0.10, "medium": 0.20, "low": 0.40}


def _range(center: float, width_pct: float) -> tuple[int, int]:
    half = center * width_pct / 2
    return (max(0, int(round(center - half))), max(0, int(round(center + half))))


def forecast_strike(
    package: dict[str, Any],
    target: dict[str, Any],
    intel_quality: str = "medium",
) -> dict[str, Any]:
    profiles = strike_profiles()
    profile = profiles[package["profile"]]
    width = _INTEL_RANGE_WIDTHS.get(intel_quality, 0.30)

    total_airframes = sum(sq.get("airframes", 0) for sq in package.get("squadrons", []))
    expected_loss_pct = profile.egress_risk
    if not target.get("ad_destroyed", False) and target.get("ad_battery_count", 0) > 0:
        expected_loss_pct += 0.05 * target["ad_battery_count"]
    expected_losses = total_airframes * expected_loss_pct
    losses_range = _range(expected_losses, width)

    expected_damage = 60 * profile.pk_modifier
    if profile.suppresses_ad:
        expected_damage *= 0.7
    damage_range = _range(expected_damage, width)

    blowback = "low"
    if target.get("command_node"):
        blowback = "high"
    elif (target.get("value", 2)) >= 4:
        blowback = "medium"
    if package.get("roe") == "decapitation":
        blowback = "critical"

    return {
        "ind_losses": list(losses_range),
        "damage_pct": list(damage_range),
        "diplomatic_blowback": blowback,
        "weapons_consumed": dict(package.get("weapons_planned", {})),
        "treasury_cost_estimate_cr": 0,
    }
