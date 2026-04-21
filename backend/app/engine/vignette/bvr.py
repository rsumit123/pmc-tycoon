"""BVR weapon table + engagement P_kill function.

Semi-realistic missile stats per the D10 philosophy: real names, real-ish
numbers (NEZ / max_range), not simulator-grade. MVP keeps weapons and
per-platform loadouts as Python constants; Plan 10 migrates to YAML.
"""

from __future__ import annotations

WEAPONS: dict[str, dict] = {
    "meteor":    {"nez_km":  85, "max_range_km": 180, "gen_bonus":  0.10, "unit_cost_cr": 18, "class": "a2a_bvr"},
    "mica_ir":   {"nez_km":  25, "max_range_km":  50, "gen_bonus":  0.00, "unit_cost_cr":  6, "class": "a2a_bvr"},
    "r77":       {"nez_km":  35, "max_range_km": 110, "gen_bonus":  0.00, "unit_cost_cr":  4, "class": "a2a_bvr"},
    "r73":       {"nez_km":  12, "max_range_km":  20, "gen_bonus":  0.00, "unit_cost_cr":  2, "class": "a2a_wvr"},
    "astra_mk1": {"nez_km":  40, "max_range_km": 110, "gen_bonus":  0.00, "unit_cost_cr":  7, "class": "a2a_bvr"},
    "astra_mk2": {"nez_km":  80, "max_range_km": 240, "gen_bonus":  0.05, "unit_cost_cr": 10, "class": "a2a_bvr"},
    "astra_mk3": {"nez_km": 115, "max_range_km": 350, "gen_bonus":  0.10, "unit_cost_cr": 18, "class": "a2a_bvr"},
    "pl15":      {"nez_km":  85, "max_range_km": 250, "gen_bonus":  0.05, "unit_cost_cr":  8, "class": "a2a_bvr"},
    "pl17":      {"nez_km": 175, "max_range_km": 400, "gen_bonus":  0.10, "unit_cost_cr": 20, "class": "a2a_bvr"},
    "pl10":      {"nez_km":  15, "max_range_km":  20, "gen_bonus":  0.00, "unit_cost_cr":  2, "class": "a2a_wvr"},
    "aim120d":   {"nez_km":  60, "max_range_km": 160, "gen_bonus":  0.08, "unit_cost_cr": 11, "class": "a2a_bvr"},
    "aim9x":     {"nez_km":  15, "max_range_km":  35, "gen_bonus":  0.10, "unit_cost_cr":  4, "class": "a2a_wvr"},
    "yj21":      {"nez_km": 200, "max_range_km": 1500, "gen_bonus":  0.10, "unit_cost_cr": 60, "class": "anti_ship"},
    "cj20":      {"nez_km": 150, "max_range_km": 2000, "gen_bonus":  0.05, "unit_cost_cr": 15, "class": "land_attack"},
    "rudram_2":  {"nez_km":  80, "max_range_km": 300,  "gen_bonus":  0.05, "unit_cost_cr": 10, "class": "anti_radiation"},
    "rudram_3":  {"nez_km": 150, "max_range_km": 550,  "gen_bonus":  0.05, "unit_cost_cr": 20, "class": "anti_radiation"},
    "brahmos_ng": {"nez_km": 120, "max_range_km": 500, "gen_bonus":  0.05, "unit_cost_cr": 35, "class": "anti_ship"},
    "air_brahmos2": {"nez_km": 250, "max_range_km": 1000, "gen_bonus": 0.10, "unit_cost_cr": 50, "class": "anti_ship"},
    "ngarm":     {"nez_km": 180, "max_range_km": 600,  "gen_bonus":  0.05, "unit_cost_cr": 12, "class": "anti_radiation"},
    "saaw":      {"nez_km":  50, "max_range_km": 100,  "gen_bonus":  0.00, "unit_cost_cr":  3, "class": "glide_bomb"},
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
    "h6kj":       {"bvr": ["yj21", "cj20"], "wvr": []},
    "kj500":      {"bvr": [],                "wvr": []},
    "mig29_upg":  {"bvr": ["r77"],           "wvr": ["r73"]},
    "jaguar_darin3": {"bvr": [],             "wvr": []},
    "mig21_bison": {"bvr": ["r77"],          "wvr": ["r73"]},
    "tejas_mk1":  {"bvr": ["astra_mk1"],     "wvr": ["r73"]},
    "netra_aewc": {"bvr": [],                "wvr": []},
    "il78_tanker": {"bvr": [],               "wvr": []},
    "tedbf":      {"bvr": ["astra_mk2"],     "wvr": ["astra_mk1"]},
    "ghatak_ucav": {"bvr": [],               "wvr": []},
    "su35":       {"bvr": ["r77"],           "wvr": ["r73"]},
    "f18e_super_hornet": {"bvr": ["aim120d"], "wvr": ["aim9x"]},
    "f15ex":      {"bvr": ["aim120d"],       "wvr": ["aim9x"]},
    "gripen_e":   {"bvr": ["meteor"],        "wvr": ["mica_ir"]},
    "eurofighter_typhoon": {"bvr": ["meteor"], "wvr": ["mica_ir"]},
    "mq9b_seaguardian": {"bvr": [],          "wvr": []},
    "heron_tp":   {"bvr": [],                "wvr": []},
    "h6n":        {"bvr": ["yj21", "cj20"], "wvr": []},
    "fujian":     {"bvr": [],                "wvr": []},
    "type004_carrier": {"bvr": [],           "wvr": []},
    "type055_destroyer": {"bvr": [],         "wvr": []},
    "type093b_ssn": {"bvr": [],              "wvr": []},
    # Cruise missiles + loitering drones — adversary-only, no A2A return fire.
    "yj21_missile":   {"bvr": [], "wvr": []},
    "cj20_missile":   {"bvr": [], "wvr": []},
    "babur_missile":  {"bvr": [], "wvr": []},
    "shahed_drone":   {"bvr": [], "wvr": []},
}

GENERATION_SCORES: dict[str, float] = {
    "3": 0.2, "4": 0.4, "4.5": 0.6, "4.75": 0.7, "5": 0.9, "6": 1.0,
}

RCS_PK_MULTIPLIER: dict[str, float] = {
    "VLO":          0.25,
    "LO":           0.45,
    "reduced":      0.70,
    "conventional": 1.00,
    "large":        1.30,
}
RCS_DETECTION_MULTIPLIER = RCS_PK_MULTIPLIER  # backward compat alias

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
    base *= RCS_PK_MULTIPLIER[defender_rcs]
    base -= ew_modifier
    return max(PK_FLOOR, min(PK_CAP, base))
