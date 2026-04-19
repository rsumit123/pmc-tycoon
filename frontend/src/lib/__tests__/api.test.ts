import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, http } from "../api";
import type { PlatformListResponse, BaseListResponse, ObjectiveListResponse, CampaignListResponse, TurnReportResponse, UnlocksResponse, LoadoutUpgrade, ADBattery, HangarResponse } from "../types";

describe("api client — platforms + bases", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("getPlatforms returns the list", async () => {
    const body: PlatformListResponse = {
      platforms: [{
        id: "rafale_f4", name: "Rafale F4", origin: "FR", role: "multirole",
        generation: "4.5", combat_radius_km: 1850, payload_kg: 9500,
        rcs_band: "reduced", radar_range_km: 200, cost_cr: 4500, intro_year: 2020,
        procurable_by: ["IND"], default_first_delivery_quarters: 8, default_foc_quarters: 16,
      }],
    };
    vi.spyOn(http, "get").mockResolvedValueOnce({ data: body } as any);
    const out = await api.getPlatforms();
    expect(out.platforms).toHaveLength(1);
    expect(out.platforms[0].id).toBe("rafale_f4");
    expect(http.get).toHaveBeenCalledWith("/api/content/platforms");
  });

  it("getBases returns the list", async () => {
    const body: BaseListResponse = {
      bases: [{
        id: 1, template_id: "ambala", name: "Ambala AFB",
        lat: 30.37, lon: 76.78,
        shelter_count: 18, fuel_depot_size: 2, ad_integration_level: 1, runway_class: "standard",
        squadrons: [],
      }],
    };
    vi.spyOn(http, "get").mockResolvedValueOnce({ data: body } as any);
    const out = await api.getBases(42);
    expect(out.bases[0].template_id).toBe("ambala");
    expect(http.get).toHaveBeenCalledWith("/api/campaigns/42/bases");
  });

  it("getObjectives returns the list", async () => {
    const body: ObjectiveListResponse = {
      objectives: [{
        id: "amca_operational_by_2035", title: "Operational AMCA Mk1 squadron by 2035",
        description: "Field a combat-ready squadron.", weight: 3, target_year: 2035,
      }],
    };
    vi.spyOn(http, "get").mockResolvedValueOnce({ data: body } as any);
    const out = await api.getObjectives();
    expect(out.objectives).toHaveLength(1);
    expect(http.get).toHaveBeenCalledWith("/api/content/objectives");
  });

  it("listCampaigns returns the list", async () => {
    const body: CampaignListResponse = {
      campaigns: [{
        id: 1, name: "Iron Spear", current_year: 2028, current_quarter: 3,
        difficulty: "realistic", budget_cr: 50000, reputation: 70,
        created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-02T00:00:00Z",
      }],
    };
    vi.spyOn(http, "get").mockResolvedValueOnce({ data: body } as any);
    const out = await api.listCampaigns();
    expect(out.campaigns).toHaveLength(1);
    expect(http.get).toHaveBeenCalledWith("/api/campaigns");
  });

  it("getTurnReport returns the report", async () => {
    const body: TurnReportResponse = {
      campaign_id: 1, year: 2026, quarter: 2,
      events: [], deliveries: [], rd_milestones: [],
      adversary_shifts: [], intel_cards: [],
      vignette_fired: null, treasury_after_cr: 100000, allocation: null,
    };
    vi.spyOn(http, "get").mockResolvedValueOnce({ data: body } as any);
    const out = await api.getTurnReport(1, 2026, 2);
    expect(out.year).toBe(2026);
    expect(http.get).toHaveBeenCalledWith("/api/campaigns/1/turn-report/2026/2");
  });

  it("getArmoryUnlocks returns unlocks", async () => {
    const body: UnlocksResponse = { missiles: [], ad_systems: [], isr_drones: [], strike_platforms: [] };
    vi.spyOn(http, "get").mockResolvedValueOnce({ data: body } as any);
    const out = await api.getArmoryUnlocks(1);
    expect(out.missiles).toEqual([]);
    expect(http.get).toHaveBeenCalledWith("/api/campaigns/1/armory/unlocks");
  });

  it("equipMissile posts the payload", async () => {
    const body: LoadoutUpgrade = { id: 1, squadron_id: 10, weapon_id: "astra_mk3", completion_year: 2027, completion_quarter: 2, status: "pending" };
    vi.spyOn(http, "post").mockResolvedValueOnce({ data: body } as any);
    const out = await api.equipMissile(1, "astra_mk3", 10);
    expect(out.weapon_id).toBe("astra_mk3");
    expect(http.post).toHaveBeenCalledWith(
      "/api/campaigns/1/armory/missiles/astra_mk3/equip",
      { squadron_id: 10 },
    );
  });

  it("installADSystem posts the payload", async () => {
    const body: ADBattery = { id: 1, base_id: 5, system_id: "akash_ng", coverage_km: 70, installed_year: 2027, installed_quarter: 1 };
    vi.spyOn(http, "post").mockResolvedValueOnce({ data: body } as any);
    const out = await api.installADSystem(1, "akash_ng", 5);
    expect(out.system_id).toBe("akash_ng");
    expect(http.post).toHaveBeenCalledWith(
      "/api/campaigns/1/armory/ad-systems/akash_ng/install",
      { base_id: 5 },
    );
  });

  it("getHangar returns the fleet", async () => {
    const body: HangarResponse = { squadrons: [], summary_by_platform: [] };
    vi.spyOn(http, "get").mockResolvedValueOnce({ data: body } as any);
    const out = await api.getHangar(1);
    expect(out.squadrons).toEqual([]);
    expect(http.get).toHaveBeenCalledWith("/api/campaigns/1/hangar");
  });
});
