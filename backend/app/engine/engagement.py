"""Pure-function engine layer for interactive engagement mode (E1/E2/E3).

No DB imports here — mirrors the rest of app/engine/. Callers (app/crud) supply
plain dicts assembled from ORM rows / content registries.
"""
from copy import deepcopy

from app.engine.vignette.bvr import WEAPONS


class EngagementResultError(Exception):
    pass


def build_briefing(
    ps: dict,
    committed_force: dict,
    squadron_rows: list[dict],
    depot_stock: dict,
    platform_specs: dict,
    loadouts: dict,
    flare_stock: int = 6,
) -> dict:
    committed_by_id = {s["squadron_id"]: s for s in committed_force.get("squadrons", [])}
    squadron_rows_by_id = {s["id"]: s for s in squadron_rows}

    player_squadrons = []
    for sid, entry in committed_by_id.items():
        row = squadron_rows_by_id.get(sid)
        if row is None:
            continue
        platform_id = row["platform_id"]
        spec = platform_specs.get(platform_id, {})
        loadout = loadouts.get(platform_id, {"bvr": [], "wvr": []})
        weapon_ids = list(loadout.get("bvr", [])) + list(loadout.get("wvr", []))
        base_id = row["base_id"]
        depot = {
            w: depot_stock.get((base_id, w), 0)
            for w in weapon_ids
        }
        player_squadrons.append({
            "id": row["id"],
            "call_sign": row["call_sign"],
            "platform_id": platform_id,
            "airframes_committed": entry["airframes"],
            "radar_range_km": spec.get("radar_range_km"),
            "loadout": {"bvr": list(loadout.get("bvr", [])), "wvr": list(loadout.get("wvr", []))},
            "depot": depot,
        })

    support = committed_force.get("support", {})
    time_budget_s = 150 if support.get("tanker") else 100

    return {
        "ao": ps.get("ao"),
        "roe": committed_force.get("roe", ps.get("roe")),
        "support": support,
        "time_budget_s": time_budget_s,
        "flare_stock": flare_stock,
        "player_squadrons": player_squadrons,
        "adversary": ps.get("adversary_force", []),
        "adversary_observed": ps.get("adversary_force_observed"),
    }


def validate_result(
    result: dict,
    ps: dict,
    committed_force: dict,
    depot_stock: dict,
    squadron_rows: list[dict],
    loadouts: dict,
    flare_stock: int = 6,
) -> None:
    committed_by_id = {s["squadron_id"]: s for s in committed_force.get("squadrons", [])}
    squadron_rows_by_id = {s["id"]: s for s in squadron_rows}

    player_squadron_id = result.get("player_squadron_id")
    if player_squadron_id not in committed_by_id:
        raise EngagementResultError(
            f"squadron {player_squadron_id} was not committed to this vignette"
        )

    flight_losses = result.get("flight_losses", 0)
    if flight_losses < 0:
        raise EngagementResultError("flight_losses must be >= 0")
    committed_airframes = committed_by_id[player_squadron_id]["airframes"]
    max_flight = min(4, committed_airframes)
    if flight_losses > max_flight:
        raise EngagementResultError(
            f"flight_losses {flight_losses} exceeds flight size {max_flight}"
        )

    flight_kills = result.get("flight_kills", {}) or {}
    adv_counts: dict[str, int] = {}
    for entry in ps.get("adversary_force", []):
        adv_counts[entry["platform_id"]] = adv_counts.get(entry["platform_id"], 0) + entry["count"]
    adv_total = sum(adv_counts.values())
    total_kills = 0
    for platform, kills in flight_kills.items():
        if kills < 0:
            raise EngagementResultError(f"flight_kills[{platform}] must be >= 0")
        available = adv_counts.get(platform, 0)
        if kills > available:
            raise EngagementResultError(
                f"flight_kills[{platform}] {kills} exceeds adversary count {available}"
            )
        total_kills += kills
    if total_kills > adv_total:
        raise EngagementResultError(
            f"total flight kills {total_kills} exceeds total adversary force {adv_total}"
        )

    row = squadron_rows_by_id.get(player_squadron_id)
    platform_id = row["platform_id"] if row else None
    loadout = loadouts.get(platform_id, {"bvr": [], "wvr": []}) if platform_id else {"bvr": [], "wvr": []}
    allowed_weapons = set(loadout.get("bvr", [])) | set(loadout.get("wvr", []))
    base_id = row["base_id"] if row else None

    munitions_expended = result.get("munitions_expended", {}) or {}
    for weapon, count in munitions_expended.items():
        if count < 0:
            raise EngagementResultError(f"munitions_expended[{weapon}] must be >= 0")
        if weapon not in allowed_weapons:
            raise EngagementResultError(
                f"weapon {weapon!r} is not in squadron {player_squadron_id}'s loadout"
            )
        available_stock = depot_stock.get((base_id, weapon), 0)
        if count > available_stock:
            raise EngagementResultError(
                f"munitions_expended[{weapon}] {count} exceeds depot stock {available_stock}"
            )

    flares_used = result.get("flares_used", 0)
    if flares_used < 0:
        raise EngagementResultError("flares_used must be >= 0")
    if flares_used > flare_stock:
        raise EngagementResultError(
            f"flares_used {flares_used} exceeds flare stock {flare_stock}"
        )


def residual_forces(ps: dict, committed_force: dict, result: dict) -> tuple[dict, dict]:
    ps_res = deepcopy(ps)
    cf_res = deepcopy(committed_force)

    flight_kills = result.get("flight_kills", {}) or {}
    remaining_kills = dict(flight_kills)
    new_adversary_force = []
    for entry in ps_res.get("adversary_force", []):
        platform = entry["platform_id"]
        kill = remaining_kills.get(platform, 0)
        if kill > 0:
            applied = min(kill, entry["count"])
            entry = dict(entry)
            entry["count"] -= applied
            remaining_kills[platform] -= applied
        if entry["count"] > 0:
            new_adversary_force.append(entry)
    ps_res["adversary_force"] = new_adversary_force

    player_squadron_id = result.get("player_squadron_id")
    new_squadrons = []
    for entry in cf_res.get("squadrons", []):
        if entry["squadron_id"] == player_squadron_id:
            flight_size = min(4, entry["airframes"])
            entry = dict(entry)
            entry["airframes"] -= flight_size
        if entry["airframes"] > 0:
            new_squadrons.append(entry)
    cf_res["squadrons"] = new_squadrons

    return ps_res, cf_res


def merge_outcomes(result: dict, residual_outcome: dict | None, ps: dict, flight_airframes: int) -> dict:
    flight_kills = result.get("flight_kills", {}) or {}
    player_adv_kia = sum(flight_kills.values())
    player_ind_kia = result.get("flight_losses", 0)

    residual_outcome = residual_outcome or {}
    adv_kia_total = player_adv_kia + residual_outcome.get("adv_kia", 0)
    ind_kia_total = player_ind_kia + residual_outcome.get("ind_kia", 0)
    adv_airframes_lost_total = player_adv_kia + residual_outcome.get("adv_airframes_lost", 0)
    ind_airframes_lost_total = player_ind_kia + residual_outcome.get("ind_airframes_lost", 0)

    threshold = ps.get("objective", {}).get("success_threshold", {})
    objective_met = (
        adv_kia_total >= threshold.get("adv_kills_min", 0)
        and ind_kia_total <= threshold.get("ind_losses_max", 10**6)
    )

    munitions_expended = list(residual_outcome.get("munitions_expended", []))
    munitions_cost_total_cr = residual_outcome.get("munitions_cost_total_cr", 0)
    for weapon, count in (result.get("munitions_expended", {}) or {}).items():
        unit_cost_cr = WEAPONS.get(weapon, {}).get("unit_cost_cr", 0)
        line_total_cr = unit_cost_cr * count
        munitions_expended.append({
            "weapon": weapon,
            "count": count,
            "unit_cost_cr": unit_cost_cr,
            "line_total_cr": line_total_cr,
        })
        munitions_cost_total_cr += line_total_cr

    return {
        "adv_kia": adv_kia_total,
        "ind_kia": ind_kia_total,
        "adv_airframes_lost": adv_airframes_lost_total,
        "ind_airframes_lost": ind_airframes_lost_total,
        "objective_met": objective_met,
        "roe": residual_outcome.get("roe", ps.get("roe", "weapons_free")),
        "support": residual_outcome.get("support", {}),
        "munitions_expended": munitions_expended,
        "munitions_cost_total_cr": munitions_cost_total_cr,
        "interactive": True,
        "disengaged": result.get("disengaged", False),
        "player_flight_airframes": flight_airframes,
    }
