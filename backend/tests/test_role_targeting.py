"""Role-based target priority: CAP should target bombers/AWACS first."""
import random
from app.engine.vignette.resolver import _resolve_round


def _make_airframes(side: str, entries: list[tuple[str, str, str]]) -> list[dict]:
    """entries: list of (platform_id, rcs_band, generation)"""
    out = []
    for pid, rcs, gen in entries:
        out.append({
            "side": side,
            "platform_id": pid,
            "generation": gen,
            "radar_range_km": 150,
            "rcs_band": rcs,
            "loadout": ["pl15", "pl10"],
            "squadron_id": None,
            "xp": 0,
        })
    return out


def test_cap_prioritizes_high_value_targets():
    """Given a mix of targets including a bomber (large RCS) and fighters,
    the bomber should be targeted disproportionately often."""
    attackers = _make_airframes("ind", [
        ("rafale_f4", "reduced", "4.5"),
        ("rafale_f4", "reduced", "4.5"),
    ])
    large_kills = 0
    total_kills = 0
    for seed in range(500):
        defenders = _make_airframes("adv", [
            ("h6kj", "large", "4"),
            ("j16", "conventional", "4.5"),
            ("j16", "conventional", "4.5"),
            ("j16", "conventional", "4.5"),
        ])
        rng = random.Random(seed)
        trace: list[dict] = []
        _, remaining = _resolve_round(
            attackers, defenders, distance_km=120, weapon_kind="bvr",
            side_label="ind", rng=rng, pk_bonus=0.0, trace=trace, t_min=3,
        )
        for t in trace:
            if t["kind"] == "kill":
                total_kills += 1
                if t["victim_platform"] == "h6kj":
                    large_kills += 1
    if total_kills > 0:
        large_rate = large_kills / total_kills
        assert large_rate > 0.30, (
            f"Large-RCS targets killed {large_rate:.0%} of the time — "
            "should be prioritized (expected >30%)"
        )
