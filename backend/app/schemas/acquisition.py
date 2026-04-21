from typing import Literal

from pydantic import BaseModel, Field


AcquisitionKind = Literal["platform", "missile_batch", "ad_battery", "ad_reload"]


class AcquisitionCreatePayload(BaseModel):
    platform_id: str  # generic resource id: platform_id | weapon_id | ad_system_id
    quantity: int = Field(gt=0)
    first_delivery_year: int = Field(ge=2026, le=2040)
    first_delivery_quarter: int = Field(ge=1, le=4)
    foc_year: int = Field(ge=2026, le=2040)
    foc_quarter: int = Field(ge=1, le=4)
    total_cost_cr: int = Field(ge=0)
    preferred_base_id: int | None = None
    kind: AcquisitionKind = "platform"
    target_battery_id: int | None = None  # required when kind == "ad_reload"


class AcquisitionRead(BaseModel):
    id: int
    platform_id: str
    quantity: int
    signed_year: int
    signed_quarter: int
    first_delivery_year: int
    first_delivery_quarter: int
    foc_year: int
    foc_quarter: int
    delivered: int
    total_cost_cr: int
    cancelled: bool = False
    preferred_base_id: int | None = None
    kind: str = "platform"
    target_battery_id: int | None = None

    model_config = {"from_attributes": True}


class AcquisitionListResponse(BaseModel):
    orders: list[AcquisitionRead]
