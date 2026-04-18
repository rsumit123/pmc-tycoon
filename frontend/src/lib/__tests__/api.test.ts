import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, http } from "../api";
import type { PlatformListResponse, BaseListResponse, ObjectiveListResponse, CampaignListResponse } from "../types";

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
});
