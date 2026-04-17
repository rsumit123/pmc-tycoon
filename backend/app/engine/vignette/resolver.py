"""Deterministic combat resolver for vignettes.

Takes a planning_state + the player's committed_force + the platforms
registry + a seed tuple (seed, year, quarter). Runs a 3-round BVR/WVR
simulation and returns (outcome_dict, event_trace_list).

Pure function: no DB, no ORM, no wall-clock time. Same inputs always
yield the same outputs — this is what the replay-determinism test
locks in.

Round structure:
  t=0..3:  Detection window; emit detection trace.
  t=3..6:  Round 1 BVR at 120 km distance.
  t=6..9:  Round 2 BVR at 50 km (survivors only).
  t=9..12: WVR merge at 15 km (survivors only).
  t=12:    Egress; outcome computed against objective.success_threshold.

ROE=visual_id_required skips Round 1 + Round 2 for IND; jumps to WVR.
"""

from __future__ import annotations

import random
from typing import Any

from app.engine.rng import subsystem_rng
from app.engine.vignette.bvr import (
    WEAPONS, PLATFORM_LOADOUTS, GENERATION_SCORES, engagement_pk,
)
from app.engine.vignette.detection import detection_advantage


WVR_PK_NON_STEALTH = 0.35
WVR_PK_STEALTH = 0.50
AWACS_IND_PK_BONUS = 0.05
WEAPONS_TIGHT_PK_PENALTY = 0.05
EW_MODIFIER_4_5_GEN = 0.05
EW_MODIFIER_5_GEN = 0.10


def _ew_for_gen(gen: str) -> float:
    g = GENERATION_SCORES.get(gen, 0.4)
    if g >= 0.9:
        return EW_MODIFIER_5_GEN
    if g >= 0.6:
        return EW_MODIFIER_4_5_GEN
    return 0.0


def _make_airframes(side: str, unit_list: list[dict], platforms: dict[str, dict]) -> list[dict]:
    """Flatten a force list into individual airframes for the resolver."""
    out: list[dict] = []
    for unit in unit_list:
        platform_id = unit["platform_id"]
        plat = platforms.get(platform_id, {})
        count = unit.get("count") or unit.get("airframes", 0)
        loadout = unit.get("loadout") or (
            PLATFORM_LOADOUTS.get(platform_id, {}).get("bvr", []) +
            PLATFORM_LOADOUTS.get(platform_id, {}).get("wvr", [])
        )
        for _ in range(count):
            out.append({
                "side": side,
                "platform_id": platform_id,
                "generation": plat.get("generation", "4"),
                "radar_range_km": plat.get("radar_range_km", 100),
                "rcs_band": plat.get("rcs_band", "conventional"),
                "loadout": list(loadout),
                "squadron_id": unit.get("squadron_id"),
                "xp": unit.get("xp", 0),
            })
    return out


def _best_weapon(loadout: list[str], kind: str) -> str | None:
    """Pick the longest-NEZ weapon of kind 'bvr' or 'wvr' from the loadout."""
    candidates = []
    for w in loadout:
        if w not in WEAPONS:
            continue
        is_wvr = WEAPONS[w]["max_range_km"] <= 30
        if kind == "bvr" and not is_wvr:
            candidates.append(w)
        elif kind == "wvr" and is_wvr:
            candidates.append(w)
    if not candidates:
        return None
    return max(candidates, key=lambda w: WEAPONS[w]["nez_km"])


def _resolve_round(
    attackers: list[dict],
    defenders: list[dict],
    distance_km: float,
    weapon_kind: str,
    side_label: str,
    rng: random.Random,
    pk_bonus: float,
    trace: list[dict],
    t_min: int,
) -> tuple[list[dict], list[dict]]:
    """Each attacker fires one weapon-of-kind at a random surviving defender.
    Returns (attackers_unchanged, new_defenders) — defenders with hits removed.
    """
    if not attackers or not defenders:
        return attackers, defenders
    survivors = list(defenders)
    kills_this_round = 0
    for a in attackers:
        if not survivors:
            break
        weapon = _best_weapon(a["loadout"], weapon_kind)
        if weapon is None:
            continue
        target = rng.choice(survivors)
        defender_gen_ew = _ew_for_gen(target["generation"])
        pk = engagement_pk(
            weapon,
            distance_km=distance_km,
            attacker_gen=a["generation"],
            defender_rcs=target["rcs_band"],
            ew_modifier=defender_gen_ew,
        )
        pk = max(0.0, min(0.70, pk + pk_bonus + min(0.10, a["xp"] * 0.01)))
        trace.append({
            "t_min": t_min, "kind": "bvr_launch" if weapon_kind == "bvr" else "wvr_launch",
            "side": side_label, "weapon": weapon,
            "attacker_platform": a["platform_id"],
            "attacker_squadron_id": a.get("squadron_id"),
            "target_platform": target["platform_id"],
            "pk": round(pk, 3), "distance_km": distance_km,
        })
        if rng.random() < pk:
            survivors.remove(target)
            kills_this_round += 1
            trace.append({
                "t_min": t_min, "kind": "kill",
                "side": side_label,
                "attacker_platform": a["platform_id"],
                "attacker_squadron_id": a.get("squadron_id"),
                "victim_platform": target["platform_id"],
                "victim_squadron_id": target.get("squadron_id"),
                "weapon": weapon,
            })
    if kills_this_round == 0:
        trace.append({
            "t_min": t_min, "kind": "no_hits", "side": side_label,
            "attackers": len(attackers), "defenders": len(defenders),
        })
    return attackers, survivors


def resolve(
    planning_state: dict,
    committed_force: dict,
    platforms_registry: dict[str, dict],
    seed: int,
    year: int,
    quarter: int,
) -> tuple[dict, list[dict]]:
    rng = subsystem_rng(seed, "vignette_resolve", year, quarter)
    trace: list[dict] = []
    roe = committed_force.get("roe", "weapons_free")
    support = committed_force.get("support", {})
    awacs = bool(support.get("awacs", False))
    tanker = bool(support.get("tanker", False))
    sead = bool(support.get("sead_package", False))

    # Enrich committed squadron dicts with platform_id + xp from the eligible list.
    eligible_by_id = {s["squadron_id"]: s for s in planning_state.get("eligible_squadrons", [])}
    ind_units = []
    for s in committed_force.get("squadrons", []):
        sid = s["squadron_id"]
        eligible = eligible_by_id.get(sid)
        if eligible is None:
            continue
        ind_units.append({
            "platform_id": eligible["platform_id"],
            "airframes": s["airframes"],
            "squadron_id": sid,
            "xp": eligible.get("xp", 0),
            "loadout": eligible.get("loadout", []),
        })
    ind_force = _make_airframes("ind", ind_units, platforms_registry)
    adv_force = _make_airframes("adv", planning_state.get("adversary_force", []),
                                platforms_registry)

    # Detection phase
    ind_radar = max((a["radar_range_km"] for a in ind_force), default=100)
    adv_radar = max((a["radar_range_km"] for a in adv_force), default=100)
    ind_target_rcs = min((a["rcs_band"] for a in adv_force),
                         default="conventional",
                         key=lambda b: {"VLO": 0, "LO": 1, "reduced": 2,
                                        "conventional": 3, "large": 4}[b])
    adv_target_rcs = min((a["rcs_band"] for a in ind_force),
                         default="conventional",
                         key=lambda b: {"VLO": 0, "LO": 1, "reduced": 2,
                                        "conventional": 3, "large": 4}[b])
    det = detection_advantage(
        ind_radar_km=ind_radar, ind_target_rcs=ind_target_rcs,
        adv_radar_km=adv_radar, adv_target_rcs=adv_target_rcs,
        ind_awacs=awacs,
    )
    trace.append({
        "t_min": 0, "kind": "detection", "advantage": det,
        "ind_radar_km": ind_radar, "adv_radar_km": adv_radar,
    })

    # Support modifiers
    ind_pk_bonus = (AWACS_IND_PK_BONUS if awacs else 0.0)
    adv_pk_bonus = 0.0
    if roe == "weapons_tight":
        ind_pk_bonus -= WEAPONS_TIGHT_PK_PENALTY

    if roe == "visual_id_required":
        trace.append({"t_min": 3, "kind": "vid_skip_bvr",
                      "reason": "ROE requires visual ID before engagement"})
        # Skip both BVR rounds for IND; ADV still fires BVR (attacks IND).
        # _resolve_round returns (attackers_unchanged, defenders_with_hits_removed).
        _, ind_force = _resolve_round(
            adv_force, ind_force, distance_km=120,
            weapon_kind="bvr", side_label="adv", rng=rng,
            pk_bonus=adv_pk_bonus, trace=trace, t_min=3,
        )
    else:
        # Round 1 BVR at 120 km, attacker order determined by detection
        first, second = (ind_force, adv_force) if det == "ind" else (adv_force, ind_force)
        first_label, second_label = ("ind", "adv") if det == "ind" else ("adv", "ind")
        first_bonus, second_bonus = (
            (ind_pk_bonus, adv_pk_bonus) if det == "ind" else (adv_pk_bonus, ind_pk_bonus)
        )
        # First mover attacks second
        _, second = _resolve_round(
            first, second, distance_km=120, weapon_kind="bvr",
            side_label=first_label, rng=rng, pk_bonus=first_bonus,
            trace=trace, t_min=3,
        )
        # Second mover returns fire if still alive
        _, first = _resolve_round(
            second, first, distance_km=120, weapon_kind="bvr",
            side_label=second_label, rng=rng, pk_bonus=second_bonus,
            trace=trace, t_min=4,
        )
        if det == "ind":
            ind_force, adv_force = first, second
        else:
            adv_force, ind_force = first, second

        # Round 2 BVR at 50 km
        _, adv_force = _resolve_round(
            ind_force, adv_force, distance_km=50, weapon_kind="bvr",
            side_label="ind", rng=rng, pk_bonus=ind_pk_bonus,
            trace=trace, t_min=6,
        )
        _, ind_force = _resolve_round(
            adv_force, ind_force, distance_km=50, weapon_kind="bvr",
            side_label="adv", rng=rng, pk_bonus=adv_pk_bonus,
            trace=trace, t_min=7,
        )

    # WVR merge at 15 km
    if ind_force and adv_force:
        _, adv_force = _resolve_round(
            ind_force, adv_force, distance_km=15, weapon_kind="wvr",
            side_label="ind", rng=rng, pk_bonus=ind_pk_bonus,
            trace=trace, t_min=9,
        )
        _, ind_force = _resolve_round(
            adv_force, ind_force, distance_km=15, weapon_kind="wvr",
            side_label="adv", rng=rng, pk_bonus=adv_pk_bonus,
            trace=trace, t_min=10,
        )

    # Outcome
    initial_ind = sum(u["airframes"] for u in ind_units)
    initial_adv = sum(u["count"] for u in planning_state.get("adversary_force", []))
    ind_kia = initial_ind - len(ind_force)
    adv_kia = initial_adv - len(adv_force)
    threshold = planning_state.get("objective", {}).get("success_threshold", {})
    objective_met = (
        adv_kia >= threshold.get("adv_kills_min", 0)
        and ind_kia <= threshold.get("ind_losses_max", initial_ind + 1)
    )
    outcome = {
        "ind_kia": ind_kia,
        "adv_kia": adv_kia,
        "ind_airframes_lost": ind_kia,
        "adv_airframes_lost": adv_kia,
        "objective_met": objective_met,
        "roe": roe,
        "support": {"awacs": awacs, "tanker": tanker, "sead_package": sead},
    }
    trace.append({"t_min": 12, "kind": "egress",
                  "ind_survivors": len(ind_force), "adv_survivors": len(adv_force)})
    trace.append({"t_min": 12, "kind": "outcome", "outcome": outcome})
    return outcome, trace
