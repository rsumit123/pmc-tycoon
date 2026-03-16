"""Campaign chapter definitions and seeder that tags existing missions."""

from sqlalchemy.orm import Session
from app.models.contract import MissionTemplate

CHAPTERS = {
    "sahara_crisis": {
        "title": "Sahara Crisis",
        "description": "A series of escalating engagements in the Western Desert Corridor. Local warlords have acquired advanced fighter aircraft and threaten regional stability.",
        "briefing": "Intelligence reports indicate hostile air assets operating from makeshift desert airfields. Your PMC has been contracted to establish air superiority over the corridor.",
        "min_rank": 0,
        "reward_money": 15000,
        "reward_rp": 50,
    },
    "pacific_tensions": {
        "title": "Pacific Tensions",
        "description": "Naval operations in contested Pacific waters. Multiple nations vie for control of strategic shipping lanes.",
        "briefing": "Satellite imagery shows naval buildups near disputed islands. Your PMC will provide both air and naval combat support to protect allied shipping routes.",
        "min_rank": 1,
        "reward_money": 30000,
        "reward_rp": 80,
    },
    "arctic_shadow": {
        "title": "Arctic Shadow",
        "description": "Covert operations in the Arctic theater. Stealth and electronic warfare are paramount against a technologically advanced adversary.",
        "briefing": "SIGINT has detected encrypted communications from an unknown Arctic facility. Deploy your best-equipped aircraft for a series of recon and strike missions.",
        "min_rank": 2,
        "reward_money": 50000,
        "reward_rp": 120,
    },
}


def seed_chapters(db: Session) -> None:
    """Tag existing MissionTemplate records with chapter assignments.

    11-mission structure:
    - Missions 1-3   -> sahara_crisis    (min_rank=0)
    - Missions 4-6   -> pacific_tensions (min_rank=1)
    - Missions 7-9   -> arctic_shadow    (min_rank=2)
    - Missions 10-11 -> standalone       (no chapter, min_rank=0)
    """
    missions = db.query(MissionTemplate).order_by(MissionTemplate.id).all()
    if not missions:
        return

    chapter_keys = ["sahara_crisis", "pacific_tensions", "arctic_shadow"]
    chapter_min_ranks = [0, 1, 2]

    for i, mission in enumerate(missions):
        if i < 3:
            mission.chapter = chapter_keys[0]
            mission.chapter_order = i + 1
            mission.min_rank = chapter_min_ranks[0]
        elif i < 6:
            mission.chapter = chapter_keys[1]
            mission.chapter_order = i - 3 + 1
            mission.min_rank = chapter_min_ranks[1]
        elif i < 9:
            mission.chapter = chapter_keys[2]
            mission.chapter_order = i - 6 + 1
            mission.min_rank = chapter_min_ranks[2]
        else:
            # Standalone — leave chapter as None
            mission.chapter = None
            mission.chapter_order = 0
            mission.min_rank = 0

    db.commit()
