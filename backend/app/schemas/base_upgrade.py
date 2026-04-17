from pydantic import BaseModel
from typing import Literal


class BaseUpgradeRequest(BaseModel):
    upgrade_type: Literal["shelter", "fuel_depot", "ad_integration", "runway"]


class BaseUpgradeResponse(BaseModel):
    base_template_id: str
    upgrade_type: str
    cost_cr: int
    shelter_count: int
    fuel_depot_size: int
    ad_integration_level: int
    runway_class: str
    remaining_budget_cr: int
