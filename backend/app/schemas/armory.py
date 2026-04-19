from pydantic import BaseModel


class MissileUnlock(BaseModel):
    target_id: str
    name: str
    description: str
    eligible_platforms: list[str]
    nez_km: int
    max_range_km: int


class ADSystemUnlock(BaseModel):
    target_id: str
    name: str
    description: str
    coverage_km: int
    install_cost_cr: int
    max_pk: float


class ISRDroneUnlock(BaseModel):
    target_id: str
    name: str
    description: str
    coverage_km: int


class StrikePlatformUnlock(BaseModel):
    target_id: str
    name: str
    description: str


class UnlocksResponse(BaseModel):
    missiles: list[MissileUnlock]
    ad_systems: list[ADSystemUnlock]
    isr_drones: list[ISRDroneUnlock]
    strike_platforms: list[StrikePlatformUnlock]


class EquipMissileRequest(BaseModel):
    squadron_id: int


class LoadoutUpgradeRead(BaseModel):
    id: int
    squadron_id: int
    weapon_id: str
    completion_year: int
    completion_quarter: int
    status: str

    model_config = {"from_attributes": True}


class InstallADRequest(BaseModel):
    base_id: int


class ADBatteryRead(BaseModel):
    id: int
    base_id: int
    system_id: str
    coverage_km: int
    installed_year: int
    installed_quarter: int

    model_config = {"from_attributes": True}
