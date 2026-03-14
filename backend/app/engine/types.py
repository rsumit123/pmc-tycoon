from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any


@dataclass
class AircraftData:
    """Flat representation of an aircraft for the engine (no DB dependency)."""
    id: int
    name: str
    origin: str
    role: str
    generation: str
    max_speed_mach: float
    max_speed_loaded_mach: float
    combat_radius_km: int
    service_ceiling_ft: int
    max_g_load: float
    thrust_to_weight_clean: float
    wing_loading_kg_m2: int
    instantaneous_turn_rate_deg_s: int
    sustained_turn_rate_deg_s: int
    empty_weight_kg: int
    max_takeoff_weight_kg: int
    internal_fuel_kg: int
    max_payload_kg: int
    hardpoints: int
    radar_type: str
    radar_range_km: int
    rcs_m2: float
    irst: bool
    ecm_suite: str
    ecm_rating: int
    chaff_count: int
    flare_count: int
    towed_decoy: bool


@dataclass
class WeaponData:
    """Flat representation of a weapon for the engine."""
    id: int
    name: str
    weapon_type: str  # BVR_AAM, IR_AAM, ASM, SAM, CIWS, GUN
    weight_kg: int
    max_range_km: int
    no_escape_range_km: int
    min_range_km: int
    speed_mach: float
    guidance: str
    seeker_generation: int
    base_pk: float
    warhead_kg: int
    eccm_rating: int
    maneuverability_g: int


@dataclass
class ShipData:
    """Flat representation of a ship for the engine."""
    id: int
    name: str
    class_name: str
    origin: str
    ship_type: str
    displacement_tons: int
    max_speed_knots: int
    radar_type: str
    radar_range_km: int
    ecm_suite: str
    ecm_rating: int
    compartments: int
    # Weapon systems as resolved lists
    anti_ship_missiles: List[Dict[str, Any]] = field(default_factory=list)  # [{weapon: WeaponData, count: int}]
    sam_systems: List[Dict[str, Any]] = field(default_factory=list)
    ciws: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class LoadoutItem:
    weapon: WeaponData
    quantity: int


@dataclass
class ChoiceOption:
    key: str  # "aggressive_scan", "notch_beam", etc.
    label: str
    description: str
    risk_hint: str  # "low", "medium", "high" — vague, player doesn't know optimal


@dataclass
class DetectionResult:
    player_detection_range_km: float
    enemy_detection_range_km: float
    advantage_km: float
    first_detect: str  # "player" or "enemy"
    narrative: str


@dataclass
class MissilePkResult:
    weapon_name: str
    final_pk: float
    range_factor: float
    ecm_factor: float
    maneuver_factor: float
    payload_factor: float
    player_modifier: float
    hit: bool
    roll: int  # the dice roll (1-100)
    narrative: str


@dataclass
class SalvoResult:
    missiles_launched: int
    leakers: int
    hits: int
    damage_percent: float
    layer_breakdown: List[Dict[str, Any]]  # [{layer, intercepted, remaining}]
    narrative: str


@dataclass
class PhaseResult:
    phase_number: int
    phase_name: str
    player_choice: str
    choice_quality: str  # "optimal", "good", "neutral", "bad"
    factors: List[Dict[str, Any]]  # [{name, value, impact, description}]
    outcome: Dict[str, Any]  # phase-specific (detection result, pk result, etc.)
    narrative: str
    next_choices: List[ChoiceOption]  # choices for the NEXT phase


@dataclass
class BattleState:
    """Snapshot of battle state for frontend tactical display."""
    phase: int
    phase_name: str
    player_name: str
    enemy_name: str
    range_km: float
    player_ammo: List[Dict[str, Any]]  # [{weapon_name, remaining}]
    player_fuel_pct: float
    player_damage_pct: float
    enemy_damage_pct: float
    available_choices: List[ChoiceOption]
    status: str  # "loadout", "in_progress", "completed"


@dataclass
class AfterActionReport:
    success: bool
    phases: List[PhaseResult]
    optimal_choices: List[str]  # what the best play would have been
    total_damage_dealt: float
    total_damage_taken: float
    payout: int
    reputation_change: int
    narrative_summary: str
