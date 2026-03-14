from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.models.ship import Ship as ShipModel
from app.models.owned_ship import OwnedShip as OwnedShipModel
from app.schemas.ship import Ship as ShipSchema

router = APIRouter(prefix="/ships", tags=["ships"])


@router.get("/", response_model=List[ShipSchema])
def list_ships(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(ShipModel).filter(ShipModel.is_active == True).offset(skip).limit(limit).all()


@router.get("/{ship_id}", response_model=ShipSchema)
def get_ship(ship_id: int, db: Session = Depends(get_db)):
    ship = db.query(ShipModel).filter(ShipModel.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")
    return ship


# Owned ship endpoints
@router.get("/owned/list")
def list_owned_ships(db: Session = Depends(get_db)):
    owned = db.query(OwnedShipModel).all()
    result = []
    for o in owned:
        s = db.query(ShipModel).filter(ShipModel.id == o.ship_id).first()
        result.append({
            "id": o.id,
            "ship_id": o.ship_id,
            "name": s.name if s else "Unknown",
            "class_name": s.class_name if s else "",
            "origin": s.origin if s else "",
            "condition": o.condition,
            "unlock_cost": s.unlock_cost if s else 0,
            "maintenance_cost": s.maintenance_cost if s else 0,
            "acquired_at": o.acquired_at,
        })
    return result


@router.post("/owned/purchase")
def purchase_ship(ship_id: int, db: Session = Depends(get_db)):
    """Purchase a ship — deducts cost from user balance."""
    from app.models.user import User
    user = db.query(User).filter(User.id == 1).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    ship = db.query(ShipModel).filter(ShipModel.id == ship_id).first()
    if not ship:
        raise HTTPException(status_code=404, detail="Ship not found")

    if user.balance < ship.unlock_cost:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    user.balance -= ship.unlock_cost
    owned = OwnedShipModel(user_id=1, ship_id=ship_id, condition=100)
    db.add(owned)
    db.commit()
    db.refresh(owned)

    return {
        "id": owned.id,
        "ship_id": ship_id,
        "name": ship.name,
        "condition": 100,
        "new_balance": user.balance,
    }


@router.delete("/owned/{owned_id}", status_code=status.HTTP_204_NO_CONTENT)
def sell_ship(owned_id: int, db: Session = Depends(get_db)):
    owned = db.query(OwnedShipModel).filter(OwnedShipModel.id == owned_id).first()
    if not owned:
        raise HTTPException(status_code=404, detail="Owned ship not found")
    db.delete(owned)
    db.commit()
    return None
