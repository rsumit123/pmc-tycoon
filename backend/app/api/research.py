"""Research & Development API — tech tree progression system."""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.research import ResearchItem, UserResearch
from app.models.subsystem import SubsystemModule
from app.models.user import User

router = APIRouter(prefix="/research", tags=["research"])


def _get_user(db: Session) -> User:
    user = db.query(User).filter(User.id == 1).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _build_research_list(db: Session, user: User) -> list:
    """Build the full research tree with status for the current user."""
    all_items = db.query(ResearchItem).order_by(ResearchItem.branch, ResearchItem.tier, ResearchItem.id).all()
    user_research = db.query(UserResearch).filter(UserResearch.user_id == user.id).all()

    # Index user research by item id
    ur_by_item = {ur.research_item_id: ur for ur in user_research}

    # Set of completed item ids
    completed_ids = {ur.research_item_id for ur in user_research if ur.status == "completed"}

    result = []
    for item in all_items:
        ur = ur_by_item.get(item.id)

        if ur and ur.status == "completed":
            status = "completed"
        elif ur and ur.status == "in_progress":
            status = "in_progress"
        elif item.prerequisite_id is None or item.prerequisite_id in completed_ids:
            status = "available"
        else:
            status = "locked"

        entry = {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "branch": item.branch,
            "tier": item.tier,
            "cost_money": item.cost_money,
            "cost_rp": item.cost_rp,
            "duration_hours": item.duration_hours,
            "prerequisite_id": item.prerequisite_id,
            "unlocks_module_name": item.unlocks_module_name,
            "status": status,
            "started_at": ur.started_at.isoformat() if ur and ur.started_at else None,
            "completed_at": ur.completed_at.isoformat() if ur and ur.completed_at else None,
        }

        # Include unlocked module stats if any
        if item.unlocks_module_name:
            module = db.query(SubsystemModule).filter(
                SubsystemModule.name == item.unlocks_module_name,
                SubsystemModule.is_default == False,
            ).first()
            if module:
                entry["unlocked_module"] = {
                    "name": module.name,
                    "slot_type": module.slot_type,
                    "tier": module.tier,
                    "origin": module.origin,
                    "description": module.description,
                    "stats": json.loads(module.stats) if module.stats else {},
                    "cost": module.cost,
                    "maintenance_cost": module.maintenance_cost,
                }

        result.append(entry)

    return result


@router.get("/items")
def list_research_items(db: Session = Depends(get_db)):
    """List all research items with their status for the current user."""
    user = _get_user(db)
    items = _build_research_list(db, user)
    return {
        "items": items,
        "research_points": getattr(user, "research_points", 0),
        "balance": user.balance,
        "tech_level": user.tech_level,
    }


@router.post("/{item_id}/start")
def start_research(item_id: int, db: Session = Depends(get_db)):
    """Start researching an item. Deducts RP and money."""
    user = _get_user(db)

    item = db.query(ResearchItem).filter(ResearchItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Research item not found")

    # Check not already started
    existing = db.query(UserResearch).filter(
        UserResearch.user_id == user.id,
        UserResearch.research_item_id == item_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Research already started or completed")

    # Check prerequisite is completed
    if item.prerequisite_id:
        prereq_ur = db.query(UserResearch).filter(
            UserResearch.user_id == user.id,
            UserResearch.research_item_id == item.prerequisite_id,
            UserResearch.status == "completed",
        ).first()
        if not prereq_ur:
            raise HTTPException(status_code=400, detail="Prerequisite research not completed")

    # Check resources
    user_rp = getattr(user, "research_points", 0)
    if user_rp < item.cost_rp:
        raise HTTPException(status_code=400, detail=f"Not enough research points ({user_rp} < {item.cost_rp})")
    if user.balance < item.cost_money:
        raise HTTPException(status_code=400, detail=f"Not enough money (${user.balance} < ${item.cost_money})")

    # Deduct resources
    user.research_points = user_rp - item.cost_rp
    user.balance -= item.cost_money

    # Create in-progress record
    ur = UserResearch(
        user_id=user.id,
        research_item_id=item_id,
        status="in_progress",
    )
    db.add(ur)
    db.commit()

    # Return updated list
    items = _build_research_list(db, user)
    return {
        "items": items,
        "research_points": getattr(user, "research_points", 0),
        "balance": user.balance,
        "tech_level": user.tech_level,
    }


@router.post("/{item_id}/complete")
def complete_research(item_id: int, db: Session = Depends(get_db)):
    """Complete a research item. Sets status to completed."""
    user = _get_user(db)

    ur = db.query(UserResearch).filter(
        UserResearch.user_id == user.id,
        UserResearch.research_item_id == item_id,
        UserResearch.status == "in_progress",
    ).first()
    if not ur:
        raise HTTPException(status_code=400, detail="Research not in progress")

    ur.status = "completed"
    ur.completed_at = datetime.now()

    # Increment tech_level if this is the highest tier completed
    item = db.query(ResearchItem).filter(ResearchItem.id == item_id).first()
    if item and item.tier > user.tech_level:
        user.tech_level = item.tier

    db.commit()

    # Return updated list
    items = _build_research_list(db, user)
    return {
        "items": items,
        "research_points": getattr(user, "research_points", 0),
        "balance": user.balance,
        "tech_level": user.tech_level,
    }


@router.get("/status")
def research_status(db: Session = Depends(get_db)):
    """Get user's research points, tech level, and research counts."""
    user = _get_user(db)

    all_ur = db.query(UserResearch).filter(UserResearch.user_id == user.id).all()
    completed = sum(1 for ur in all_ur if ur.status == "completed")
    in_progress = sum(1 for ur in all_ur if ur.status == "in_progress")

    total_items = db.query(ResearchItem).count()
    # Available = items with no prereq or prereq completed, minus started ones
    completed_ids = {ur.research_item_id for ur in all_ur if ur.status == "completed"}
    started_ids = {ur.research_item_id for ur in all_ur}
    all_items = db.query(ResearchItem).all()
    available = 0
    for item in all_items:
        if item.id in started_ids:
            continue
        if item.prerequisite_id is None or item.prerequisite_id in completed_ids:
            available += 1

    return {
        "research_points": getattr(user, "research_points", 0),
        "balance": user.balance,
        "tech_level": user.tech_level,
        "completed": completed,
        "in_progress": in_progress,
        "available": available,
        "total": total_items,
    }
