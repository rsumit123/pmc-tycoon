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


class RDProgramSpec(BaseModel):
    id: str
    name: str
    description: str
    base_duration_quarters: int
    base_cost_cr: int
    dependencies: list[str] = Field(default_factory=list)


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
