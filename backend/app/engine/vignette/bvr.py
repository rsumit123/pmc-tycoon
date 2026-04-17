"""BVR weapon table + engagement P_kill function.

Semi-realistic missile stats per the D10 philosophy: real names, real-ish
numbers (NEZ / max_range), not simulator-grade. MVP keeps weapons and
per-platform loadouts as Python constants; Plan 10 migrates to YAML.
"""

from __future__ import annotations

WEAPONS: dict[str, dict] = {
    "meteor":    {"nez_km":  85, "max_range_km": 180, "gen_bonus":  0.10},
    "mica_ir":   {"nez_km":  25, "max_range_km":  50, "gen_bonus":  0.00},
    "r77":       {"nez_km":  35, "max_range_km": 110, "gen_bonus":  0.00},
    "r73":       {"nez_km":  12, "max_range_km":  20, "gen_bonus":  0.00},
    "astra_mk1": {"nez_km":  40, "max_range_km": 110, "gen_bonus":  0.00},
    "astra_mk2": {"nez_km":  80, "max_range_km": 240, "gen_bonus":  0.05},
    "astra_mk3": {"nez_km": 115, "max_range_km": 350, "gen_bonus":  0.10},
    "pl15":      {"nez_km":  85, "max_range_km": 250, "gen_bonus":  0.05},
    "pl17":      {"nez_km": 175, "max_range_km": 400, "gen_bonus":  0.10},
    "pl10":      {"nez_km":  15, "max_range_km":  20, "gen_bonus":  0.00},
}

PLATFORM_LOADOUTS: dict[str, dict[str, list[str]]] = {
    "rafale_f4":  {"bvr": ["meteor"],        "wvr": ["mica_ir"]},
    "rafale_f5":  {"bvr": ["meteor"],        "wvr": ["mica_ir"]},
    "tejas_mk1a": {"bvr": ["astra_mk1"],     "wvr": ["r73"]},
    "tejas_mk2":  {"bvr": ["astra_mk2"],     "wvr": ["r73"]},
    "su30_mki":   {"bvr": ["r77"],           "wvr": ["r73"]},
    "mirage2000": {"bvr": ["r77"],           "wvr": ["mica_ir"]},
    "amca_mk1":   {"bvr": ["astra_mk2"],     "wvr": ["r73"]},
    "j20a":       {"bvr": ["pl15", "pl17"],  "wvr": ["pl10"]},
    "j20s":       {"bvr": ["pl15", "pl17"],  "wvr": ["pl10"]},
    "j35a":       {"bvr": ["pl15"],          "wvr": ["pl10"]},
    "j35e":       {"bvr": ["pl15"],          "wvr": ["pl10"]},
    "j16":        {"bvr": ["pl15"],          "wvr": ["pl10"]},
    "j10c":       {"bvr": ["pl15"],          "wvr": ["pl10"]},
    "j10ce":      {"bvr": ["pl15"],          "wvr": ["pl10"]},
    "j11b":       {"bvr": ["pl15"],          "wvr": ["pl10"]},
    "jf17_blk3":  {"bvr": ["pl15"],          "wvr": ["pl10"]},
    "f16_blk52":  {"bvr": ["pl15"],          "wvr": ["pl10"]},
    "j36":        {"bvr": ["pl15", "pl17"],  "wvr": ["pl10"]},
    "j36_prototype": {"bvr": ["pl15"],       "wvr": ["pl10"]},
    "h6kj":       {"bvr": [],                "wvr": []},
    "kj500":      {"bvr": [],                "wvr": []},
}

GENERATION_SCORES: dict[str, float] = {
    "3": 0.2, "4": 0.4, "4.5": 0.6, "4.75": 0.7, "5": 0.9, "6": 1.0,
}

RCS_DETECTION_MULTIPLIER: dict[str, float] = {
    "VLO":          0.25,
    "LO":           0.45,
    "reduced":      0.70,
    "conventional": 1.00,
    "large":        1.30,
}

PK_CAP = 0.70
PK_FLOOR = 0.0


def engagement_pk(
    weapon: str,
    distance_km: float,
    attacker_gen: str,
    defender_rcs: str,
    ew_modifier: float,
) -> float:
    w = WEAPONS[weapon]
    if distance_km > w["max_range_km"]:
        return 0.0
    if distance_km <= w["nez_km"]:
        base = 0.45
    else:
        span = max(1.0, w["max_range_km"] - w["nez_km"])
        frac = (distance_km - w["nez_km"]) / span
        base = 0.15 - 0.10 * frac    # 0.15 at edge of NEZ, 0.05 at max range
    gen_gap = GENERATION_SCORES.get(attacker_gen, 0.4) - 0.4
    base += max(-0.10, gen_gap * 0.15) + w["gen_bonus"]
    base *= RCS_DETECTION_MULTIPLIER[defender_rcs]
    base -= ew_modifier
    return max(PK_FLOOR, min(PK_CAP, base))
