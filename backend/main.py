from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Dict, Optional

from app.db.session import engine, SessionLocal
from app.db.base import Base

# Import all models to ensure they are registered with Base
from app.models.user import User
from app.models.unit import OwnedUnit, BaseUnitTemplate
from app.models.contractor import OwnedContractor, ContractorTemplate
from app.models.contract import MissionTemplate, ActiveContract, MissionLog, Faction, MissionStatus
from app.models.aircraft import Aircraft
from app.models.weapon import Weapon
from app.models.ship import Ship
from app.models.battle import Battle, BattlePhase
from app.models.owned_aircraft import OwnedAircraft
from app.models.owned_ship import OwnedShip

from app.api.units import router as units_router
from app.api.contractors import router as contractors_router
from app.api.contracts import router as contracts_router
from app.api.simulation import router as simulation_router
from app.api.aircraft import router as aircraft_router
from app.api.weapons import router as weapons_router
from app.api.ships import router as ships_router
from app.api.battle import router as battle_router

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="PMC Tycoon API", version="0.1.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "https://pmc-tycoon.skdev.one",
        "https://pmc-tycoon.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Include routers
app.include_router(units_router)
app.include_router(contractors_router)
app.include_router(contracts_router)
app.include_router(simulation_router)
app.include_router(aircraft_router)
app.include_router(weapons_router)
app.include_router(ships_router)
app.include_router(battle_router)

@app.get("/")
async def root():
    return {"message": "Welcome to PMC Tycoon API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

# Endpoint to get user stats (for demo, we'll get user with id=1)
@app.get("/api/user/{user_id}")
def get_user_stats(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {
        "id": user.id,
        "username": user.username,
        "balance": user.balance,
        "reputation": user.reputation,
        "tech_level": user.tech_level
    }

class UserUpdate(BaseModel):
    balance: Optional[int] = None
    reputation: Optional[int] = None
    tech_level: Optional[int] = None

@app.put("/api/user/{user_id}")
def update_user_stats(user_id: int, update: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if update.balance is not None:
        user.balance = update.balance
    if update.reputation is not None:
        user.reputation = update.reputation
    if update.tech_level is not None:
        user.tech_level = update.tech_level

    db.commit()
    db.refresh(user)
    return {
        "id": user.id,
        "username": user.username,
        "balance": user.balance,
        "reputation": user.reputation,
        "tech_level": user.tech_level
    }