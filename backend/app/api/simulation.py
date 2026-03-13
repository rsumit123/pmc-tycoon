from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import random
import math
from datetime import datetime

from app.db.session import get_db
from app.models.unit import OwnedUnit, BaseUnitTemplate
from app.models.contractor import OwnedContractor, ContractorTemplate
from app.models.contract import MissionTemplate, ActiveContract, MissionLog, MissionStatus
from app.models.user import User

router = APIRouter(prefix="/simulation", tags=["simulation"])

def calculate_unit_strength(unit: OwnedUnit, template: BaseUnitTemplate) -> Dict[str, float]:
    """Calculate the effective strength of a unit based on its condition and upgrades"""
    # Base stats from template
    base_attack = float(template.base_attack)
    base_defense = float(template.base_defense)
    base_speed = float(template.base_speed)
    base_range = float(template.base_range)
    
    # Condition modifier (0-100% condition affects performance)
    condition_modifier = float(unit.condition) / 100.0
    
    # Apply condition modifier
    attack = base_attack * condition_modifier
    defense = base_defense * condition_modifier
    speed = base_speed * condition_modifier
    unit_range = base_range * condition_modifier
    
    # TODO: Apply upgrades logic here
    # For now, we'll just return base stats modified by condition
    
    return {
        "attack": attack,
        "defense": defense,
        "speed": speed,
        "range": unit_range,
        "overall": (attack + defense + speed + unit_range) / 4.0
    }

def calculate_contractor_effectiveness(contractor: OwnedContractor, template: ContractorTemplate) -> Dict[str, float]:
    """Calculate the effectiveness of a contractor based on skill and fatigue"""
    # Base skill from template
    base_skill = float(template.base_skill)
    
    # Current skill level (can be improved through experience)
    skill_level = float(contractor.skill_level)
    
    # Fatigue modifier (0-100 fatigue reduces effectiveness)
    fatigue_level = float(contractor.fatigue_level)
    fatigue_modifier = max(0.1, 1.0 - (fatigue_level / 100.0))
    
    # Effective skill combines base skill, current level, and fatigue
    effective_skill = (base_skill + skill_level) / 2.0 * fatigue_modifier
    
    return {
        "skill": effective_skill,
        "fatigue_modifier": fatigue_modifier
    }

def simulate_mission_outcome(
    user: User,
    assigned_units: List[Dict[str, Any]],
    assigned_contractors: List[Dict[str, Any]],
    mission_template: MissionTemplate
) -> Dict[str, Any]:
    """
    Simulate the outcome of a mission based on unit stats, contractor skills,
    mission difficulty, and random events.
    """
    # Calculate total allied strength
    ally_strength = 0.0
    unit_details = []
    
    for unit_data in assigned_units:
        unit = unit_data["unit"]
        template = unit_data["template"]
        
        strength_dict = calculate_unit_strength(unit, template)
        strength = strength_dict["overall"]
        ally_strength += strength
        
        unit_details.append({
            "unit_id": unit.id,
            "unit_name": getattr(getattr(unit, 'template', None), 'name', "Unknown"),
            "strength": strength,
            "condition": float(unit.condition)
        })
    
    # Calculate total contractor effectiveness
    contractor_effectiveness = 0.0
    contractor_details = []
    
    for contractor_data in assigned_contractors:
        contractor = contractor_data["contractor"]
        template = contractor_data["template"]
        
        effectiveness_dict = calculate_contractor_effectiveness(contractor, template)
        effectiveness = effectiveness_dict["skill"]
        contractor_effectiveness += effectiveness
        
        contractor_details.append({
            "contractor_id": contractor.id,
            "contractor_name": getattr(getattr(contractor, 'template', None), 'name', "Unknown"),
            "effectiveness": effectiveness,
            "fatigue_level": float(contractor.fatigue_level)
        })
    
    # Mission difficulty based on risk level
    mission_difficulty = float(mission_template.risk_level) / 100.0  # Convert to 0-1 scale
    
    # Base success probability
    # Allied strength vs mission difficulty, with contractor effectiveness as modifier
    if ally_strength > 0:
        strength_ratio = ally_strength / 100.0  # Normalize ally strength
    else:
        strength_ratio = 0.0
    
    # Contractor bonus (up to +30% success chance)
    contractor_bonus = min(0.3, contractor_effectiveness / 200.0)
    
    # Base success probability
    base_success_prob = min(0.95, max(0.05, strength_ratio * (1.0 - mission_difficulty) + contractor_bonus))
    
    # Apply random events
    random_events = []
    final_success_prob = base_success_prob
    
    # Random event chance increases with mission risk
    if random.random() < (float(mission_template.risk_level) / 200.0):  # 0-50% chance based on risk
        event_type = random.choice([
            "unexpected_weather",
            "equipment_failure", 
            "intelligence_error",
            "hostile_reinforcements",
            "friendly_fire",
            "lucky_break"
        ])
        
        event_impact = 0.0
        event_description = ""
        
        if event_type == "unexpected_weather":
            event_impact = -random.uniform(0.1, 0.3)  # -10% to -30% success
            event_description = "Unexpected adverse weather conditions reduced visibility and accuracy"
        elif event_type == "equipment_failure":
            event_impact = -random.uniform(0.15, 0.25)  # -15% to -25% success
            event_description = "Critical equipment failure on one of your units"
        elif event_type == "intelligence_error":
            event_impact = -random.uniform(0.05, 0.15)  # -5% to -15% success
            event_description = "Intelligence proved inaccurate; enemy defenses stronger than expected"
        elif event_type == "hostile_reinforcements":
            event_impact = -random.uniform(0.2, 0.4)  # -20% to -40% success
            event_description = "Enemy called in unexpected reinforcements"
        elif event_type == "friendly_fire":
            event_impact = -random.uniform(0.1, 0.2)  # -10% to -20% success
            event_description = "Friendly fire incident caused casualties and confusion"
        elif event_type == "lucky_break":
            event_impact = random.uniform(0.1, 0.2)  # +10% to +20% success
            event_description = "Fortunate circumstances worked in your favor"
        
        final_success_prob += event_impact
        final_success_prob = max(0.01, min(0.99, final_success_prob))  # Clamp between 1% and 99%
        
        random_events.append({
            "type": event_type,
            "description": event_description,
            "impact": event_impact
        })
    
    # Determine mission outcome
    success = random.random() < final_success_prob
    
    # Calculate rewards and losses
    base_payout = float(mission_template.base_payout)
    payout_multiplier = 1.0
    
    if success:
        payout_multiplier = 1.0 + random.uniform(0.0, 0.5)  # 0-50% bonus for success
        reputation_change = int(mission_template.political_impact)
    else:
        payout_multiplier = 0.5  # 50% payout for failure (partial completion)
        reputation_change = int(mission_template.political_impact * 0.5)  # Reduced impact for failure
    
    final_payout = int(base_payout * payout_multiplier)
    
    # Calculate unit damage and contractor fatigue increase
    damage_factor = 1.0 - final_success_prob  # Higher damage if less successful
    
    # Apply damage to units
    for unit_data in assigned_units:
        unit = unit_data["unit"]
        # Damage increases with mission risk and decreases with success
        damage = random.uniform(5.0, 25.0) * damage_factor * (float(mission_template.risk_level) / 100.0)
        new_condition = max(0, float(unit.condition) - int(damage))
        # Store the new condition to update later
        unit_data["new_condition"] = new_condition
    
    # Increase contractor fatigue
    for contractor_data in assigned_contractors:
        contractor = contractor_data["contractor"]
        # Fatigue increases with mission duration and intensity
        fatigue_increase = random.uniform(5.0, 15.0) * (float(mission_template.estimated_duration_hours) / 24.0)
        new_fatigue = min(100, float(contractor.fatigue_level) + int(fatigue_increase))
        # Store the new fatigue to update later
        contractor_data["new_fatigue"] = new_fatigue
    
    return {
        "success": success,
        "payout": final_payout,
        "reputation_change": reputation_change,
        "ally_strength": ally_strength,
        "enemy_strength": float(mission_template.risk_level) * 2.0,  # Scale enemy strength based on risk
        "random_events": random_events,
        "unit_details": unit_details,
        "contractor_details": contractor_details,
        "final_success_probability": final_success_prob
    }

@router.post("/run-mission/{contract_id}")
def run_mission_simulation(
    contract_id: int,
    db: Session = Depends(get_db)
):
    """Run a mission simulation for an active contract"""
    # Get the active contract
    contract = db.query(ActiveContract).filter(ActiveContract.id == contract_id).first()
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found")
    
    if contract.status != MissionStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Contract is not active")
    
    # Get mission template
    mission_template = db.query(MissionTemplate).filter(MissionTemplate.id == contract.mission_template_id).first()
    if not mission_template:
        raise HTTPException(status_code=404, detail="Mission template not found")
    
    # Get user (assuming user_id = 1 for now, in real app this would come from auth)
    user = db.query(User).filter(User.id == 1).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # For simplicity, we'll use mock data since we don't have proper JSON parsing set up
    # In a real implementation, we'd parse the JSON strings in assigned_units and assigned_contractors
    mock_units = db.query(OwnedUnit).filter(OwnedUnit.user_id == user.id).limit(3).all()
    mock_contractors = db.query(OwnedContractor).filter(OwnedContractor.user_id == user.id).limit(2).all()
    
    assigned_units = []
    assigned_contractors = []
    
    for unit in mock_units:
        template = db.query(BaseUnitTemplate).filter(BaseUnitTemplate.id == unit.template_id).first()
        if template:
            assigned_units.append({"unit": unit, "template": template})
    
    for contractor in mock_contractors:
        template = db.query(ContractorTemplate).filter(ContractorTemplate.id == contractor.template_id).first()
        if template:
            assigned_contractors.append({"contractor": contractor, "template": template})
    
    # Run simulation
    result = simulate_mission_outcome(user, assigned_units, assigned_contractors, mission_template)
    
    # Update unit conditions and contractor fatigue in the database
    for i, unit_data in enumerate(assigned_units):
        if "new_condition" in unit_data:
            unit = unit_data["unit"]
            unit.condition = unit_data["new_condition"]
    
    for i, contractor_data in enumerate(assigned_contractors):
        if "new_fatigue" in contractor_data:
            contractor = contractor_data["contractor"]
            contractor.fatigue_level = contractor_data["new_fatigue"]
    
    # Update contract with results
    if result["success"]:
        contract.status = MissionStatus.COMPLETED_SUCCESS
    else:
        contract.status = MissionStatus.COMPLETED_FAILURE
    
    contract.payout_received = result["payout"]
    contract.reputation_change = result["reputation_change"]
    contract.political_impact_change = result["reputation_change"]  # Simplified
    contract.completed_at = datetime.now()
    
    # Update user stats
    user.balance += result["payout"]
    new_reputation = user.reputation + result["reputation_change"]
    user.reputation = max(0, min(100, new_reputation))
    
    # Create mission log entry
    mission_log = MissionLog(
        user_id=user.id,
        mission_template_id=mission_template.id,
        status=MissionStatus.COMPLETED_SUCCESS if result["success"] else MissionStatus.COMPLETED_FAILURE,
        payout_earned=result["payout"],
        reputation_change=result["reputation_change"],
        enemy_strength=result["enemy_strength"],
        ally_strength=result["ally_strength"],
        random_events=str(result["random_events"]),  # Simplified JSON storage
        started_at=contract.started_at,
        ended_at=datetime.now()
    )
    
    db.add(mission_log)
    db.commit()
    db.refresh(contract)
    db.refresh(user)
    db.refresh(mission_log)
    
    return {
        "contract_id": contract.id,
        "mission_title": mission_template.title,
        "success": result["success"],
        "payout": result["payout"],
        "reputation_change": result["reputation_change"],
        "ally_strength": result["ally_strength"],
        "enemy_strength": result["enemy_strength"],
        "random_events": result["random_events"],
        "new_balance": user.balance,
        "new_reputation": user.reputation
    }

@router.get("/mission-history/{user_id}")
def get_mission_history(
    user_id: int,
    db: Session = Depends(get_db)
):
    """Get mission history for a user"""
    logs = db.query(MissionLog).filter(MissionLog.user_id == user_id).order_by(MissionLog.started_at.desc()).all()
    return logs