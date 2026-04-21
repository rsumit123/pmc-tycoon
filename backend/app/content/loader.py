from dataclasses import dataclass
from pathlib import Path
from typing import Literal
import yaml
from pydantic import BaseModel, Field


class PlatformSpec(BaseModel):
    id: str
    name: str
    origin: str
    role: str
    generation: str
    combat_radius_km: int
    payload_kg: int
    rcs_band: Literal["VLO", "LO", "reduced", "conventional", "large"]
    radar_range_km: int = 0
    cost_cr: int = 0
    intro_year: int = 2000
    image_url: str | None = None
    procurable_by: list[str] = Field(default_factory=list)
    default_first_delivery_quarters: int = 8
    default_foc_quarters: int = 16


class BaseSpec(BaseModel):
    id: str
    name: str
    lat: float
    lon: float
    runway_class: str = "medium"
    faction: str = "IND"


class ObjectiveSpec(BaseModel):
    id: str
    title: str
    description: str
    weight: int = 1
    target_year: int | None = None


class UnlockSpec(BaseModel):
    """Declares what completing an R&D program unlocks.

    kind:
      - 'missile'          → target_id is a weapon id in WEAPONS; eligible_platforms is a list of platform ids that can carry it.
      - 'ad_system'        → target_id is an AD system id; coverage_km is SAM bubble.
      - 'isr_drone'        → target_id is a platform_id that becomes available as an ISR drone.
      - 'strike_platform'  → target_id is a platform_id that becomes procurable (unmanned strike role).
      - 'platform'         → target_id is a fighter platform_id that becomes procurable.
      - 'none'             → cosmetic completion (some R&D is doctrinal).
    """
    kind: str = "none"
    target_id: str | None = None
    eligible_platforms: list[str] = Field(default_factory=list)
    coverage_km: int | None = None
    description: str = ""


class RDProgramSpec(BaseModel):
    id: str
    name: str
    description: str
    base_duration_quarters: int
    base_cost_cr: int
    dependencies: list[str] = Field(default_factory=list)
    unlocks: UnlockSpec = Field(default_factory=UnlockSpec)


def _load_yaml(path: Path) -> dict:
    with open(path) as f:
        data = yaml.safe_load(f)
    if data is None:
        return {}
    return data


def load_platforms(path: Path) -> dict[str, PlatformSpec]:
    data = _load_yaml(path)
    return {row["id"]: PlatformSpec(**row) for row in data.get("platforms", [])}


def load_bases(path: Path) -> dict[str, BaseSpec]:
    data = _load_yaml(path)
    return {row["id"]: BaseSpec(**row) for row in data.get("bases", [])}


def load_objectives(path: Path) -> dict[str, ObjectiveSpec]:
    data = _load_yaml(path)
    return {row["id"]: ObjectiveSpec(**row) for row in data.get("objectives", [])}


def load_rd_programs(path: Path) -> dict[str, RDProgramSpec]:
    data = _load_yaml(path)
    return {row["id"]: RDProgramSpec(**row) for row in data.get("programs", [])}


class ADSystemSpec(BaseModel):
    id: str
    name: str
    description: str
    coverage_km: int
    install_cost_cr: int
    max_pk: float
    tier: str
    interceptor_cost_cr: int = 0


def load_ad_systems(path: Path) -> dict[str, ADSystemSpec]:
    data = _load_yaml(path)
    return {row["id"]: ADSystemSpec(**row) for row in data.get("ad_systems", [])}


@dataclass(frozen=True)
class RoadmapEffect:
    kind: str
    payload: object


@dataclass(frozen=True)
class RoadmapIntel:
    headline: str
    source_type: str
    confidence: float
    forced_true: bool = False


@dataclass(frozen=True)
class RoadmapEvent:
    year: int
    quarter: int
    faction: str
    effect: RoadmapEffect
    intel: RoadmapIntel | None = None


def load_adversary_roadmap(path: Path) -> list[RoadmapEvent]:
    data = _load_yaml(path)
    out: list[RoadmapEvent] = []
    for raw in data.get("events", []):
        eff = raw["effect"]
        effect = RoadmapEffect(kind=eff["kind"], payload=eff.get("payload"))
        intel_raw = raw.get("intel")
        intel = (
            RoadmapIntel(
                headline=intel_raw["headline"],
                source_type=intel_raw["source_type"],
                confidence=intel_raw["confidence"],
                forced_true=intel_raw.get("forced_true", False),
            )
            if intel_raw else None
        )
        out.append(RoadmapEvent(
            year=raw["year"],
            quarter=raw["quarter"],
            faction=raw["faction"],
            effect=effect,
            intel=intel,
        ))
    return out


@dataclass(frozen=True)
class IntelTemplate:
    id: str
    faction: str
    source_types: list[str]
    headline_template: str
    subject_type: str
    payload_keys: dict
    trigger: dict | None = None


def load_intel_templates(path: Path) -> list[IntelTemplate]:
    data = _load_yaml(path)
    out: list[IntelTemplate] = []
    for raw in data.get("templates", []):
        out.append(IntelTemplate(
            id=raw["id"],
            faction=raw["faction"],
            source_types=list(raw["source_types"]),
            headline_template=raw["headline_template"],
            subject_type=raw["subject_type"],
            payload_keys=dict(raw["payload_keys"]),
            trigger=raw.get("trigger"),
        ))
    return out


@dataclass(frozen=True)
class ScenarioTemplate:
    id: str
    name: str
    ao: dict
    response_clock_minutes: int
    q_index_min: int
    q_index_max: int
    weight: float
    requires: dict
    adversary_roster: list
    allowed_ind_roles: list[str]
    roe_options: list[str]
    objective: dict


def load_scenario_templates(path: Path) -> list[ScenarioTemplate]:
    data = _load_yaml(path)
    out: list[ScenarioTemplate] = []
    for raw in data.get("templates", []):
        out.append(ScenarioTemplate(
            id=raw["id"],
            name=raw["name"],
            ao=dict(raw["ao"]),
            response_clock_minutes=raw["response_clock_minutes"],
            q_index_min=raw["q_index_min"],
            q_index_max=raw["q_index_max"],
            weight=float(raw["weight"]),
            requires=dict(raw.get("requires") or {}),
            adversary_roster=[dict(r) for r in raw["adversary_roster"]],
            allowed_ind_roles=list(raw["allowed_ind_roles"]),
            roe_options=list(raw["roe_options"]),
            objective=dict(raw["objective"]),
        ))
    return out
