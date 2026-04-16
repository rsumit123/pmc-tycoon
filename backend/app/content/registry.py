from functools import lru_cache
from pathlib import Path

from app.core.config import settings
from app.content.loader import (
    PlatformSpec, BaseSpec, ObjectiveSpec, RDProgramSpec,
    load_platforms, load_bases, load_objectives, load_rd_programs,
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


def reload_all() -> None:
    for fn in (platforms, bases, objectives, rd_programs):
        fn.cache_clear()
