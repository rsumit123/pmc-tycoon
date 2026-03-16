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


# ═══ Tactical Battle System (v2) ═══

@dataclass
class TurnAction:
    """A single action the player can take during a tactical turn."""
    key: str  # "fire_bvr_1", "scan", "close", "extend", etc.
    label: str
    description: str
    risk_hint: str  # "low", "medium", "high"
    weapon_id: Optional[int] = None
    pk_preview: Optional[float] = None  # estimated Pk if this is a fire action


@dataclass
class EnemyIntel:
    """Fog of war state — what the player knows about the enemy."""
    name: str
    # Which stats have been revealed
    radar_known: bool = False
    rcs_known: bool = False
    ecm_known: bool = False
    loadout_known: bool = False
    fuel_known: bool = False
    damage_known: bool = False
    # Revealed values (populated when discovered)
    radar_type: Optional[str] = None
    radar_range_km: Optional[int] = None
    rcs_m2: Optional[float] = None
    ecm_suite: Optional[str] = None
    ecm_rating: Optional[int] = None
    observed_weapons: List[str] = field(default_factory=list)
    fuel_pct: Optional[float] = None
    damage_pct: Optional[float] = None


INTEL_REVEAL_ORDER = ["radar", "rcs", "ecm", "loadout", "fuel", "damage"]


@dataclass
class TurnResult:
    """Result of a single tactical turn."""
    turn_number: int
    player_action: str
    enemy_action: str
    weapon_fired: Optional[str] = None
    shot_pk: Optional[float] = None
    shot_hit: Optional[bool] = None
    enemy_weapon_fired: Optional[str] = None
    enemy_shot_pk: Optional[float] = None
    enemy_shot_hit: Optional[bool] = None
    damage_dealt: float = 0.0
    damage_taken: float = 0.0
    range_change: float = 0.0
    new_range: float = 0.0
    zone: str = "BVR"
    intel_revealed: Optional[str] = None
    fuel_consumed: float = 0.0
    narrative: str = ""
    factors: List[Dict[str, Any]] = field(default_factory=list)
    next_actions: List[TurnAction] = field(default_factory=list)


@dataclass
class TacticalBattleState:
    """Full tactical battle state snapshot for frontend."""
    turn: int
    max_turns: int
    range_km: float
    zone: str  # "BVR", "TRANSITION", "WVR"
    player_name: str
    enemy_intel: Dict[str, Any]
    player_ammo: List[Dict[str, Any]]
    fuel_pct: float
    damage_pct: float
    ecm_charges: int
    flare_uses: int
    available_actions: List[TurnAction]
    status: str  # "in_progress", "completed"
    exit_reason: Optional[str] = None
    objective: Optional[str] = None


@dataclass
class TacticalAfterActionReport:
    """After-action report for the tactical battle system."""
    success: bool
    exit_reason: str
    turns_played: int
    turns: List[TurnResult]
    total_damage_dealt: float
    total_damage_taken: float
    fuel_remaining: float
    payout: int
    reputation_change: int
    narrative_summary: str


# ═══ Naval Tactical Battle System (v2) ═══

@dataclass
class ShipCompartment:
    """Damage state for a ship compartment."""
    name: str  # "engines", "radar", "weapons", "hull"
    hp_pct: float = 100.0  # 0-100


@dataclass
class NavalTurnAction:
    """Action available during a naval turn."""
    key: str
    label: str
    description: str
    risk_hint: str  # "low", "medium", "high"
    salvo_size: Optional[int] = None  # how many missiles this fires


@dataclass
class NavalTurnResult:
    """Result of one naval combat turn."""
    turn_number: int
    phase: str  # "approach", "exchange", "aftermath"
    player_action: str
    enemy_action: str
    player_salvo_fired: int = 0
    player_hits: int = 0
    player_damage_dealt: float = 0.0
    enemy_salvo_fired: int = 0
    enemy_hits: int = 0
    enemy_damage_taken: float = 0.0
    compartment_hit: Optional[str] = None  # which compartment took damage
    damage_repaired: float = 0.0
    range_change: float = 0.0
    new_range: float = 0.0
    intel_revealed: Optional[str] = None
    narrative: str = ""
    factors: List[Dict[str, Any]] = field(default_factory=list)
    next_actions: List["NavalTurnAction"] = field(default_factory=list)


@dataclass
class NavalTacticalState:
    """Full naval battle state for frontend."""
    turn: int
    max_turns: int
    phase: str  # "approach", "exchange", "aftermath"
    range_km: float
    player_name: str
    enemy_name: str
    player_compartments: List[Dict[str, Any]]  # [{name, hp_pct}]
    enemy_compartments_known: List[Dict[str, Any]]  # fog of war
    player_missiles_remaining: int
    player_sam_ready: bool
    player_ciws_ready: bool
    ecm_charges: int
    available_actions: List[NavalTurnAction]
    status: str  # "in_progress", "completed"
    exit_reason: Optional[str] = None


@dataclass
class NavalAfterActionReport:
    """After-action report for naval tactical battle."""
    success: bool
    exit_reason: str
    turns_played: int
    turns: List[NavalTurnResult]
    total_damage_dealt: float
    total_damage_taken: float
    compartment_status: List[Dict[str, Any]]
    payout: int
    reputation_change: int
    narrative_summary: str
