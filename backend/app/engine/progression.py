"""PMC rank progression and pilot levelling helpers."""

RANKS = [
    {"name": "STARTUP", "min_rep": 0, "min_missions": 0},
    {"name": "LICENSED", "min_rep": 20, "min_missions": 10},
    {"name": "ESTABLISHED", "min_rep": 40, "min_missions": 25},
    {"name": "ELITE", "min_rep": 60, "min_missions": 50},
    {"name": "LEGENDARY", "min_rep": 80, "min_missions": 100},
]


def get_rank(reputation: int, missions_completed: int) -> dict:
    """Returns current rank info + next rank info."""
    current = RANKS[0]
    for rank in RANKS:
        if reputation >= rank["min_rep"] and missions_completed >= rank["min_missions"]:
            current = rank

    current_idx = RANKS.index(current)
    next_rank = RANKS[current_idx + 1] if current_idx < len(RANKS) - 1 else None

    return {
        "rank": current["name"],
        "rank_index": current_idx,
        "next_rank": next_rank["name"] if next_rank else None,
        "next_rep_needed": next_rank["min_rep"] if next_rank else current["min_rep"],
        "next_missions_needed": next_rank["min_missions"] if next_rank else current["min_missions"],
    }


def calc_pilot_level(xp: int) -> int:
    """XP thresholds: 0=L1, 100=L2, 300=L3, 600=L4, 1000=L5, 1500=L6..."""
    thresholds = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5200]
    level = 1
    for i, threshold in enumerate(thresholds):
        if xp >= threshold:
            level = i + 1
    return min(level, 10)


def calc_pilot_skill_bonus(level: int) -> int:
    """Each level above 1 gives +2 skill points."""
    return (level - 1) * 2
