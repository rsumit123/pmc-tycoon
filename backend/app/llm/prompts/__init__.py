"""Prompt module registry + canonical input hashing.

Every prompt is a module in this package that exports:
  - VERSION: str    (e.g. "v1")
  - KIND: str       (e.g. "aar")
  - build_messages(inputs: dict) -> list[dict]   # OpenAI message shape
  - build_input_hash(inputs: dict) -> str        # stable hash over the canonical payload

Modules self-register in REGISTRY on import.
"""
from __future__ import annotations

import hashlib
import json
from typing import Callable, Protocol


class PromptModule(Protocol):
    VERSION: str
    KIND: str
    def build_messages(self, inputs: dict) -> list[dict]: ...
    def build_input_hash(self, inputs: dict) -> str: ...


REGISTRY: dict[str, "PromptModule"] = {}


def register(module) -> None:
    """Called at the bottom of each prompt module to publish itself."""
    key = f"{module.KIND}:{module.VERSION}"
    if key in REGISTRY:
        raise RuntimeError(f"duplicate prompt registration: {key}")
    REGISTRY[key] = module


def input_hash(payload: dict) -> str:
    """Stable sha256 over a canonicalized JSON payload."""
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def cache_key(kind: str, version: str, model: str, ihash: str) -> str:
    blob = f"{kind}:{version}:{model}:{ihash}".encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


def get_prompt(kind: str, version: str = "v1"):
    key = f"{kind}:{version}"
    if key not in REGISTRY:
        raise KeyError(f"no prompt registered for {key}")
    return REGISTRY[key]
