from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Dict

from app.db.session import engine, SessionLocal
from app.db.base import Base

# Import all models to ensure they are registered with Base
from app.models.user import User
from app.models.unit import OwnedUnit, BaseUnitTemplate
from app.models.contractor import OwnedContractor, ContractorTemplate
from app.models.contract import MissionTemplate, ActiveContract, MissionLog, Faction, MissionStatus

from app.api.units import router as units_router
from app.api.contractors import router as contractors_router
from app.api.contracts import router as contracts_router
from app.api.simulation import router as simulation_router

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="PMC Tycoon API", version="0.1.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite dev server
        "http://localhost:5174",  # Alternative Vite port
        "http://localhost:5175",  # Alternative Vite port
        "http://localhost:5176",  # Alternative Vite port
        "http://localhost:5177",  # Alternative Vite port
        "http://localhost:5178",  # Alternative Vite port
        "http://localhost:5179",  # Alternative Vite port
        "http://localhost:5180",  # Alternative Vite port
        "http://localhost:5181",  # Alternative Vite port
        "http://localhost:5182",  # Alternative Vite port
        "http://localhost:5183",  # Alternative Vite port
        "http://localhost:5190",  # Alternative Vite port
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