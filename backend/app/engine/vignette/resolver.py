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
from app.engine.vignette.ad_engagement import resolve_ad_engagement


WVR_PK_NON_STEALTH = 0.35
WVR_PK_STEALTH = 0.50
AWACS_IND_PK_BONUS = 0.05
WEAPONS_TIGHT_PK_PENALTY = 0.05
WEAPONS_TIGHT_FIRE_RATE = 0.6   # weapons_tight: attackers hold fire ~40% of the time
WEAPONS_TIGHT_PK_BONUS = 0.03   # pickier shots → slightly higher hit rate when they do fire
EW_MODIFIER_4_5_GEN = 0.05
EW_MODIFIER_5_GEN = 0.10

# Target priority weights by RCS band: high-value/large-radar-cross-section
# targets (bombers, AWACS) are preferentially targeted over stealthy fighters.
TARGET_PRIORITY: dict[str, float] = {
    "large": 3.0,
    "conventional": 1.5,
    "reduced": 1.0,
    "LO": 0.8,
    "VLO": 0.6,
}


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
                "base_id": unit.get("base_id"),
                "xp": unit.get("xp", 0),
            })
    return out


# Ground/ship-strike + anti-radiation munitions — NOT air-to-air,
# can't be picked for BVR or WVR aerial engagements even though they're
# in the WEAPONS table (they live there for pricing + planning display).
A2A_EXCLUDED: frozenset[str] = frozenset({
    "yj21", "cj20",                          # anti-ship / LACM (PLA/PLAN)
    "brahmos_ng", "air_brahmos2",            # supersonic anti-ship / strike
    "rudram_2", "rudram_3", "ngarm", "saaw", # anti-radiation / standoff
})


def _best_weapon(loadout: list[str], kind: str) -> str | None:
    """Pick the longest-NEZ weapon of kind 'bvr' or 'wvr' from the loadout.
    Strike-class weapons (BrahMos / YJ-21 / Rudram / SAAW) are filtered out
    — they can be in a squadron's loadout (for non-combat strikes or
    display cost) but are not air-to-air shots.
    """
    candidates = []
    for w in loadout:
        if w not in WEAPONS:
            continue
        if w in A2A_EXCLUDED:
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
    fire_rate: float = 1.0,
    stock: dict | None = None,
) -> tuple[list[dict], list[dict]]:
    """Each attacker fires one weapon-of-kind at a random surviving defender.
    Returns (attackers_unchanged, new_defenders) — defenders with hits removed.

    fire_rate: probability that a given attacker actually fires this round.
    Used by weapons_tight ROE to throttle launches (realism + munitions cost).
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
        # Per-base stockpile gate (IND side only; adversary stock is abstracted).
        # If the caller supplied a stock dict, check the attacker's base depot
        # for this weapon. Empty depot → hold fire, no shot.
        if side_label == "ind" and stock is not None:
            base_id = a.get("base_id")
            if base_id is not None:
                key = (base_id, weapon)
                if key in stock and stock[key] <= 0:
                    continue
        if fire_rate < 1.0 and rng.random() >= fire_rate:
            continue  # ROE: holding fire this pass
        weights = [TARGET_PRIORITY.get(s["rcs_band"], 1.0) for s in survivors]
        target = rng.choices(survivors, weights=weights, k=1)[0]
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
        if side_label == "ind" and stock is not None:
            base_id = a.get("base_id")
            if base_id is not None:
                key = (base_id, weapon)
                if key in stock:
                    stock[key] = stock[key] - 1
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
    # Support platforms (AWACS/tanker/ISR) are activated via support toggles, not combat commit.
    # If a legacy client commits one, skip it — they don't belong in BVR combat.
    _SUPPORT_PLATFORMS = {
        "netra_aewc", "phalcon_a50", "netra_aewc_mk2",
        "il78_tanker", "il78mki",
        "tapas_uav", "ghatak_ucav",
    }
    eligible_by_id = {s["squadron_id"]: s for s in planning_state.get("eligible_squadrons", [])}
    ind_units = []
    for s in committed_force.get("squadrons", []):
        sid = s["squadron_id"]
        eligible = eligible_by_id.get(sid)
        if eligible is None:
            continue
        if eligible.get("platform_id") in _SUPPORT_PLATFORMS:
            continue
        ind_units.append({
            "platform_id": eligible["platform_id"],
            "airframes": s["airframes"],
            "squadron_id": sid,
            "base_id": eligible.get("base_id"),
            "xp": eligible.get("xp", 0),
            "loadout": eligible.get("loadout", []),
        })
    ind_force = _make_airframes("ind", ind_units, platforms_registry)
    adv_force = _make_airframes("adv", planning_state.get("adversary_force", []),
                                platforms_registry)

    # Per-base missile stockpile. If the caller passed an empty dict (or none),
    # stock gating is disabled (legacy/unlimited behavior). We keep the
    # initial snapshot for consumed/remaining reporting after combat.
    initial_stock_raw = planning_state.get("missile_stock") or {}
    initial_stock: dict[tuple[int, str], int] = {
        tuple(k) if not isinstance(k, tuple) else k: v
        for k, v in initial_stock_raw.items()
    }
    stock: dict[tuple[int, str], int] | None = (
        dict(initial_stock) if initial_stock else None
    )

    # AD pre-round — friendly SAMs engage adversary airframes if AO is in coverage.
    ad_batteries = planning_state.get("ad_batteries", [])
    ad_specs = planning_state.get("ad_specs", {})
    bases_reg_ps = planning_state.get("bases_registry", {})
    if ad_batteries:
        new_adv_entries, ad_trace = resolve_ad_engagement(
            ao=planning_state["ao"], batteries=ad_batteries,
            bases_registry=bases_reg_ps, ad_specs=ad_specs,
            adv_force=planning_state.get("adversary_force", []),
            rng=rng,
        )
        trace.extend(ad_trace)
        adv_force = _make_airframes("adv", new_adv_entries, platforms_registry)

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
    # ROE — weapons_tight throttles launches (saves munitions) and slightly
    # raises PK on the shots that do fire (pickier targeting).
    ind_fire_rate = 1.0
    if roe == "weapons_tight":
        ind_fire_rate = WEAPONS_TIGHT_FIRE_RATE
        ind_pk_bonus += WEAPONS_TIGHT_PK_BONUS

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
        first_rate = ind_fire_rate if first_label == "ind" else 1.0
        second_rate = ind_fire_rate if second_label == "ind" else 1.0
        # First mover attacks second
        _, second = _resolve_round(
            first, second, distance_km=120, weapon_kind="bvr",
            side_label=first_label, rng=rng, pk_bonus=first_bonus,
            trace=trace, t_min=3, fire_rate=first_rate,
            stock=stock,
        )
        # Second mover returns fire if still alive
        _, first = _resolve_round(
            second, first, distance_km=120, weapon_kind="bvr",
            side_label=second_label, rng=rng, pk_bonus=second_bonus,
            trace=trace, t_min=4, fire_rate=second_rate,
            stock=stock,
        )
        if det == "ind":
            ind_force, adv_force = first, second
        else:
            adv_force, ind_force = first, second

        # Round 2 BVR at 50 km
        _, adv_force = _resolve_round(
            ind_force, adv_force, distance_km=50, weapon_kind="bvr",
            side_label="ind", rng=rng, pk_bonus=ind_pk_bonus,
            trace=trace, t_min=6, fire_rate=ind_fire_rate,
            stock=stock,
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
            trace=trace, t_min=9, fire_rate=ind_fire_rate,
            stock=stock,
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
    # Munitions expended — tally IND launches + hits per weapon, price from
    # WEAPONS table. Adversary is abstracted, we only bill the player.
    ind_launches: dict[str, int] = {}
    ind_hits: dict[str, int] = {}
    for ev in trace:
        k = ev.get("kind")
        if ev.get("side") != "ind":
            continue
        if k in ("bvr_launch", "wvr_launch"):
            ind_launches[ev["weapon"]] = ind_launches.get(ev["weapon"], 0) + 1
        elif k == "kill":
            w = ev.get("weapon")
            if w:
                ind_hits[w] = ind_hits.get(w, 0) + 1
    munitions_expended: list[dict] = []
    total_cost = 0
    for weapon, count in sorted(ind_launches.items(), key=lambda kv: -kv[1]):
        unit_cost = WEAPONS.get(weapon, {}).get("unit_cost_cr", 0)
        line_total = count * unit_cost
        total_cost += line_total
        munitions_expended.append({
            "weapon": weapon,
            "fired": count,
            "hits": ind_hits.get(weapon, 0),
            "unit_cost_cr": unit_cost,
            "total_cost_cr": line_total,
        })

    # Compute stock consumption for UI + post-combat persistence.
    consumed_by_weapon: dict[str, int] = {}
    remaining: dict[tuple[int, str], int] = {}
    if stock is not None:
        for key, remaining_count in stock.items():
            remaining[key] = remaining_count
            initial_count = initial_stock.get(key, remaining_count)
            burned = initial_count - remaining_count
            if burned > 0:
                wid = key[1]
                consumed_by_weapon[wid] = consumed_by_weapon.get(wid, 0) + burned

    outcome = {
        "ind_kia": ind_kia,
        "adv_kia": adv_kia,
        "ind_airframes_lost": ind_kia,
        "adv_airframes_lost": adv_kia,
        "objective_met": objective_met,
        "roe": roe,
        "support": {"awacs": awacs, "tanker": tanker, "sead_package": sead},
        "munitions_expended": munitions_expended,
        "munitions_cost_total_cr": total_cost,
        "missile_stock_consumed": consumed_by_weapon,
        "missile_stock_remaining": remaining,
    }
    trace.append({"t_min": 12, "kind": "egress",
                  "ind_survivors": len(ind_force), "adv_survivors": len(adv_force)})
    # Strip the tuple-keyed `missile_stock_remaining` from the trace — the
    # trace is JSON-persisted to the DB, tuple keys are not serializable.
    trace_outcome = {k: v for k, v in outcome.items() if k != "missile_stock_remaining"}
    trace.append({"t_min": 12, "kind": "outcome", "outcome": trace_outcome})
    return outcome, trace
