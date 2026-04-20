"""Pure-function campaign performance aggregator.

Given a list of resolved-vignette dicts (planning_state / committed_force /
event_trace / outcome), returns a dict matching PerformanceResponse
shape. No DB, no ORM, no side effects — easy to unit test.

Shape:
    {
        "totals": { total_sorties, total_kills, total_losses,
                    total_munitions_cost_cr, avg_cost_per_kill_cr },
        "factions": [ { faction, sorties, wins, losses, win_rate_pct,
                        avg_exchange_ratio, avg_munitions_cost_cr }, ... ],
        "platforms": [ { platform_id, platform_name, sorties, kills, losses,
                         kd_ratio, win_contribution_pct, first_shot_pct,
                         top_weapon }, ... ],
        "weapons":   [ { weapon_id, fired, hits, hit_rate_pct, avg_pk,
                         total_cost_cr, cost_per_kill_cr,
                         top_target_platform, weapon_class }, ... ],
        "support":   [ { asset, with_sorties, without_sorties,
                         with_win_rate_pct, without_win_rate_pct,
                         delta_win_rate_pp }, ... ],
    }
"""
from __future__ import annotations


FACTION_ORDER = ["PLAAF", "PAF", "PLAN"]
SUPPORT_KEYS = ["awacs", "tanker", "sead"]  # maps to support.awacs / support.tanker / support.sead_package


def _faction_of(vignette: dict) -> str:
    force = vignette.get("planning_state", {}).get("adversary_force", [])
    if force and "faction" in force[0]:
        return force[0]["faction"]
    return "UNKNOWN"


def _aggregate_factions(resolved_vignettes: list[dict]) -> list[dict]:
    # Seed every faction with zeroes so the response order is stable.
    agg = {
        f: {"sorties": 0, "wins": 0, "losses": 0, "ind_losses": 0, "adv_losses": 0, "munitions": 0}
        for f in FACTION_ORDER
    }
    for v in resolved_vignettes:
        faction = _faction_of(v)
        if faction not in agg:
            continue  # skip UNKNOWN/unexpected factions rather than creating new rows
        outcome = v.get("outcome") or {}
        a = agg[faction]
        a["sorties"] += 1
        if outcome.get("objective_met"):
            a["wins"] += 1
        else:
            a["losses"] += 1
        a["ind_losses"] += int(outcome.get("ind_airframes_lost", 0) or 0)
        a["adv_losses"] += int(outcome.get("adv_airframes_lost", 0) or 0)
        a["munitions"] += int(outcome.get("munitions_cost_total_cr", 0) or 0)

    out = []
    for f in FACTION_ORDER:
        a = agg[f]
        sorties = a["sorties"]
        win_rate = round((a["wins"] / sorties) * 100) if sorties > 0 else 0
        if sorties == 0:
            exchange = None
        else:
            exchange = round(a["adv_losses"] / max(1, a["ind_losses"]), 2)
        avg_munitions = (a["munitions"] // sorties) if sorties > 0 else 0
        out.append({
            "faction": f,
            "sorties": sorties,
            "wins": a["wins"],
            "losses": a["losses"],
            "win_rate_pct": win_rate,
            "avg_exchange_ratio": exchange,
            "avg_munitions_cost_cr": avg_munitions,
        })
    return out


def _committed_platforms(vignette: dict) -> set[str]:
    """Set of platform_ids committed in this vignette (dedup across squadrons)."""
    eligible = {s["squadron_id"]: s for s in vignette.get("planning_state", {}).get("eligible_squadrons", [])}
    out: set[str] = set()
    for c in vignette.get("committed_force", {}).get("squadrons", []):
        es = eligible.get(c["squadron_id"])
        if es and es.get("platform_id"):
            out.add(es["platform_id"])
    return out


def _detection_advantage(vignette: dict) -> str | None:
    for ev in vignette.get("event_trace", []) or []:
        if ev.get("kind") == "detection":
            return ev.get("advantage")
    return None


def _aggregate_platforms(resolved_vignettes: list[dict], platforms_by_id: dict[str, dict]) -> list[dict]:
    # platform_id -> {sorties, kills, losses, wins, first_shots, weapon_counts: {weapon: int}}
    agg: dict[str, dict] = {}

    for v in resolved_vignettes:
        committed = _committed_platforms(v)
        if not committed:
            continue
        outcome = v.get("outcome") or {}
        won = bool(outcome.get("objective_met"))
        det = _detection_advantage(v)

        for pid in committed:
            a = agg.setdefault(pid, {
                "sorties": 0, "kills": 0, "losses": 0,
                "wins": 0, "first_shots": 0,
                "weapon_counts": {},
            })
            a["sorties"] += 1
            if won:
                a["wins"] += 1
            if det == "ind":
                a["first_shots"] += 1

        for ev in v.get("event_trace") or []:
            kind = ev.get("kind")
            if kind == "kill":
                if ev.get("side") == "ind":
                    pid = ev.get("attacker_platform")
                    if pid in agg:
                        agg[pid]["kills"] += 1
                elif ev.get("side") == "adv":
                    pid = ev.get("victim_platform")
                    if pid in agg:
                        agg[pid]["losses"] += 1
            elif kind in ("bvr_launch", "wvr_launch") and ev.get("side") == "ind":
                pid = ev.get("attacker_platform")
                w = ev.get("weapon")
                if pid in agg and w:
                    agg[pid]["weapon_counts"][w] = agg[pid]["weapon_counts"].get(w, 0) + 1

    out = []
    for pid, a in agg.items():
        sorties = a["sorties"]
        kd = None
        if a["losses"] > 0:
            kd = round(a["kills"] / a["losses"], 2)
        top_weapon = max(a["weapon_counts"].items(), key=lambda kv: kv[1])[0] if a["weapon_counts"] else None
        out.append({
            "platform_id": pid,
            "platform_name": (platforms_by_id.get(pid) or {}).get("name", pid),
            "sorties": sorties,
            "kills": a["kills"],
            "losses": a["losses"],
            "kd_ratio": kd,
            "win_contribution_pct": round((a["wins"] / sorties) * 100) if sorties > 0 else 0,
            "first_shot_pct": round((a["first_shots"] / sorties) * 100) if sorties > 0 else 0,
            "top_weapon": top_weapon,
        })
    # Sort by sorties desc, then platform_id asc for deterministic tie-break
    out.sort(key=lambda p: (-p["sorties"], p["platform_id"]))
    return out


def _aggregate_weapons(resolved_vignettes: list[dict], weapons_by_id: dict[str, dict]) -> list[dict]:
    # weapon_id -> {fired, hits, total_cost, pk_sum, pk_count, target_counts: {platform: int}}
    agg: dict[str, dict] = {}

    for v in resolved_vignettes:
        outcome = v.get("outcome") or {}

        # fired/hits/cost come from munitions_expended rows (authoritative — resolver writes these)
        for me in outcome.get("munitions_expended") or []:
            wid = me.get("weapon")
            if not wid:
                continue
            a = agg.setdefault(wid, {
                "fired": 0, "hits": 0, "total_cost": 0,
                "pk_sum": 0.0, "pk_count": 0,
                "target_counts": {},
            })
            a["fired"] += int(me.get("fired", 0) or 0)
            a["hits"] += int(me.get("hits", 0) or 0)
            a["total_cost"] += int(me.get("total_cost_cr", 0) or 0)

        # avg PK + top-target derived from event_trace (PK field lives there, not in munitions row)
        for ev in v.get("event_trace") or []:
            kind = ev.get("kind")
            if kind in ("bvr_launch", "wvr_launch") and ev.get("side") == "ind":
                wid = ev.get("weapon")
                if not wid:
                    continue
                a = agg.setdefault(wid, {
                    "fired": 0, "hits": 0, "total_cost": 0,
                    "pk_sum": 0.0, "pk_count": 0,
                    "target_counts": {},
                })
                pk = ev.get("pk")
                if isinstance(pk, (int, float)):
                    a["pk_sum"] += float(pk)
                    a["pk_count"] += 1
            elif kind == "kill" and ev.get("side") == "ind":
                wid = ev.get("weapon")
                victim = ev.get("victim_platform")
                if wid and victim and wid in agg:
                    agg[wid]["target_counts"][victim] = agg[wid]["target_counts"].get(victim, 0) + 1

    out = []
    for wid, a in agg.items():
        spec = weapons_by_id.get(wid) or {}
        fired = a["fired"]
        hits = a["hits"]
        hit_rate = round((hits / fired) * 100) if fired > 0 else 0
        avg_pk = round(a["pk_sum"] / a["pk_count"], 2) if a["pk_count"] > 0 else 0
        cost_per_kill = (a["total_cost"] // hits) if hits > 0 else None
        top_target = max(a["target_counts"].items(), key=lambda kv: kv[1])[0] if a["target_counts"] else None
        out.append({
            "weapon_id": wid,
            "fired": fired,
            "hits": hits,
            "hit_rate_pct": hit_rate,
            "avg_pk": avg_pk,
            "total_cost_cr": a["total_cost"],
            "cost_per_kill_cr": cost_per_kill,
            "top_target_platform": top_target,
            "weapon_class": spec.get("class", "a2a_bvr"),
        })

    # Drop entries with zero fired AND zero cost (defensive — shouldn't happen but prevents noise)
    out = [w for w in out if w["fired"] > 0 or w["total_cost_cr"] > 0]
    # Sort: fired desc, then weapon_id asc
    out.sort(key=lambda w: (-w["fired"], w["weapon_id"]))
    return out


# Map of support asset id → the key it lives under in committed_force.support
# ("sead" is stored as "sead_package" historically — preserve compatibility).
_SUPPORT_PAYLOAD_KEY = {"awacs": "awacs", "tanker": "tanker", "sead": "sead_package"}


def _aggregate_support(resolved_vignettes: list[dict]) -> list[dict]:
    tallies = {
        asset: {"with_sorties": 0, "with_wins": 0, "without_sorties": 0, "without_wins": 0}
        for asset in SUPPORT_KEYS
    }
    for v in resolved_vignettes:
        outcome = v.get("outcome") or {}
        support = outcome.get("support") or v.get("committed_force", {}).get("support") or {}
        won = bool(outcome.get("objective_met"))
        for asset in SUPPORT_KEYS:
            key = _SUPPORT_PAYLOAD_KEY[asset]
            if bool(support.get(key, False)):
                tallies[asset]["with_sorties"] += 1
                if won:
                    tallies[asset]["with_wins"] += 1
            else:
                tallies[asset]["without_sorties"] += 1
                if won:
                    tallies[asset]["without_wins"] += 1

    out = []
    for asset in SUPPORT_KEYS:
        t = tallies[asset]
        with_rate = round((t["with_wins"] / t["with_sorties"]) * 100) if t["with_sorties"] > 0 else 0
        without_rate = round((t["without_wins"] / t["without_sorties"]) * 100) if t["without_sorties"] > 0 else 0
        # Delta is only meaningful if both sides have sorties; otherwise zero it.
        if t["with_sorties"] == 0 or t["without_sorties"] == 0:
            delta = 0
        else:
            delta = with_rate - without_rate
        out.append({
            "asset": asset,
            "with_sorties": t["with_sorties"],
            "without_sorties": t["without_sorties"],
            "with_win_rate_pct": with_rate,
            "without_win_rate_pct": without_rate,
            "delta_win_rate_pp": delta,
        })
    return out


def compute_performance(
    resolved_vignettes: list[dict],
    platforms_by_id: dict[str, dict],
    weapons_by_id: dict[str, dict],
) -> dict:
    total_sorties = len(resolved_vignettes)
    total_kills = 0
    total_losses = 0
    total_munitions_cost = 0

    for v in resolved_vignettes:
        trace = v.get("event_trace") or []
        outcome = v.get("outcome") or {}
        for ev in trace:
            if ev.get("kind") != "kill":
                continue
            if ev.get("side") == "ind":
                total_kills += 1
            elif ev.get("side") == "adv":
                total_losses += 1
        total_munitions_cost += int(outcome.get("munitions_cost_total_cr", 0) or 0)

    avg_cost_per_kill = (total_munitions_cost // total_kills) if total_kills > 0 else None

    return {
        "totals": {
            "total_sorties": total_sorties,
            "total_kills": total_kills,
            "total_losses": total_losses,
            "total_munitions_cost_cr": total_munitions_cost,
            "avg_cost_per_kill_cr": avg_cost_per_kill,
        },
        "factions": _aggregate_factions(resolved_vignettes),
        "platforms": _aggregate_platforms(resolved_vignettes, platforms_by_id),
        "weapons": _aggregate_weapons(resolved_vignettes, weapons_by_id),
        "support": _aggregate_support(resolved_vignettes),
    }
