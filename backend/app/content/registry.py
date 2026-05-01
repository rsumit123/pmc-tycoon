from functools import lru_cache
from pathlib import Path

from app.core.config import settings
from app.content.loader import (
    PlatformSpec, BaseSpec, ObjectiveSpec, RDProgramSpec, ADSystemSpec,
    AdversaryBaseSpec,
    DiplomacyConfig,
    StrikeProfileSpec,
    load_platforms, load_bases, load_objectives, load_rd_programs, load_ad_systems,
    load_adversary_roadmap, load_intel_templates, load_scenario_templates,
    load_adversary_bases,
    load_diplomacy,
    load_strike_profiles,
)


@lru_cache(maxsize=1)
def platforms() -> dict[str, PlatformSpec]:
    return load_platforms(Path(settings.content_dir) / "platforms.yaml")


@lru_cache(maxsize=1)
def bases() -> dict[str, BaseSpec]:
    return load_bases(Path(settings.content_dir) / "bases.yaml")


@lru_cache(maxsize=1)
def objectives() -> dict[str, ObjectiveSpec]:
    return load_objectives(Path(settings.content_dir) / "objectives.yaml")


@lru_cache(maxsize=1)
def rd_programs() -> dict[str, RDProgramSpec]:
    return load_rd_programs(Path(settings.content_dir) / "rd_programs.yaml")


@lru_cache(maxsize=1)
def ad_systems() -> dict[str, ADSystemSpec]:
    return load_ad_systems(Path(settings.content_dir) / "ad_systems.yaml")


@lru_cache(maxsize=1)
def adversary_roadmap() -> list:
    return load_adversary_roadmap(Path(settings.content_dir) / "adversary_roadmap.yaml")


@lru_cache(maxsize=1)
def intel_templates() -> list:
    return load_intel_templates(Path(settings.content_dir) / "intel_templates.yaml")


@lru_cache(maxsize=1)
def scenario_templates() -> list:
    return load_scenario_templates(Path(settings.content_dir) / "scenario_templates.yaml")


@lru_cache(maxsize=1)
def adversary_bases() -> dict[str, AdversaryBaseSpec]:
    return load_adversary_bases(Path(settings.content_dir) / "adversary_bases.yaml")


@lru_cache(maxsize=1)
def diplomacy() -> DiplomacyConfig:
    return load_diplomacy(Path(settings.content_dir) / "diplomacy.yaml")


@lru_cache(maxsize=1)
def strike_profiles() -> dict[str, StrikeProfileSpec]:
    return load_strike_profiles(Path(settings.content_dir) / "strike_profiles.yaml")


def reload_all() -> None:
    for fn in (platforms, bases, objectives, rd_programs, ad_systems,
               adversary_roadmap, intel_templates, scenario_templates,
               adversary_bases, diplomacy, strike_profiles):
        fn.cache_clear()
