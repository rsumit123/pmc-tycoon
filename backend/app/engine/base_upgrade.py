"""Base upgrade cost and effect calculations."""
from typing import Literal

UpgradeType = Literal["shelter", "fuel_depot", "ad_integration", "runway"]

UPGRADE_COSTS: dict[str, int] = {
    "shelter": 5000,
    "fuel_depot": 3000,
    "ad_integration": 8000,
    "runway": 10000,
}

UPGRADE_CAPS: dict[str, int] = {
    "shelter": 36,
    "fuel_depot": 5,
    "ad_integration": 3,
    "runway": 3,
}

RUNWAY_LEVELS = {"light": 1, "medium": 2, "heavy": 3}
RUNWAY_NAMES = {1: "light", 2: "medium", 3: "heavy"}


def upgrade_cost(upgrade_type: UpgradeType) -> int:
    return UPGRADE_COSTS[upgrade_type]
