"""Radar detection: radar_range_km x RCS_multiplier (+1.5x AWACS boost).

detection_range_km returns an integer km at which a radar sees a target
of the given RCS band. detection_advantage compares two sides and
returns 'ind' | 'adv' | 'tie' depending on who sees farther.
"""

from __future__ import annotations


AWACS_MULTIPLIER = 1.5

RCS_DETECTION_RANGE_MULTIPLIER: dict[str, float] = {
    "VLO":          0.20,
    "LO":           0.40,
    "reduced":      0.65,
    "conventional": 1.00,
    "large":        1.40,
}


def detection_range_km(radar_range_km: int, target_rcs: str, awacs: bool) -> int:
    raw = radar_range_km * RCS_DETECTION_RANGE_MULTIPLIER[target_rcs]
    if awacs:
        raw *= AWACS_MULTIPLIER
    return int(raw)


def detection_advantage(
    ind_radar_km: int,
    ind_target_rcs: str,
    adv_radar_km: int,
    adv_target_rcs: str,
    ind_awacs: bool,
) -> str:
    ind_sees = detection_range_km(ind_radar_km, ind_target_rcs, awacs=ind_awacs)
    adv_sees = detection_range_km(adv_radar_km, adv_target_rcs, awacs=False)
    if ind_sees > adv_sees:
        return "ind"
    if adv_sees > ind_sees:
        return "adv"
    return "tie"
