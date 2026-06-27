import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AcquisitionPipeline } from "../AcquisitionPipeline";
import type { Platform, Notification, WeaponMeta } from "../../../lib/types";

// ---- mock the campaign store so we can inject notifications ----
const mockNotifications: Notification[] = [
  {
    id: "low_stock:3:meteor",
    kind: "low_stock",
    severity: "warning",
    title: "Low meteor stock at Ambala",
    body: "Depot below 25%",
    action_url: "/campaign/1/procurement?tab=acquisitions&offer=missiles&missile=meteor&base=3&qty=40",
  },
  {
    id: "low_stock:2:astra_mk1",
    kind: "low_stock",
    severity: "warning",
    title: "Low astra_mk1 stock at Jodhpur",
    body: "Depot below 25%",
    action_url: "/campaign/1/procurement?tab=acquisitions&offer=missiles&missile=astra_mk1&base=2&qty=30",
  },
];

const mockLoadNotifications = vi.fn();

vi.mock("../../../store/campaignStore", () => ({
  useCampaignStore: (sel: (s: unknown) => unknown) => {
    const state = {
      notifications: mockNotifications,
      loadNotifications: mockLoadNotifications,
    };
    return sel(state);
  },
}));

// ---- test data ----
const platforms: Platform[] = [
  {
    id: "tejas_mk1a",
    name: "Tejas Mk1A",
    origin: "IND",
    role: "multirole",
    generation: "4.5",
    combat_radius_km: 500,
    payload_kg: 5300,
    rcs_band: "reduced",
    radar_range_km: 150,
    cost_cr: 500,
    intro_year: 2024,
    procurable_by: ["IND"],
    default_first_delivery_quarters: 8,
    default_foc_quarters: 16,
  },
];

const weaponsById: Record<string, WeaponMeta> = {
  meteor: { id: "meteor", name: "Meteor", weapon_class: "bvr", nez_km: 60, max_range_km: 150, unit_cost_cr: 30 },
  astra_mk1: { id: "astra_mk1", name: "Astra Mk1", weapon_class: "bvr", nez_km: 20, max_range_km: 70, unit_cost_cr: 5 },
};

describe("AcquisitionPipeline — restock button", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("shows Restock all low depots button with count 2", () => {
    const onSign = vi.fn();
    render(
      <AcquisitionPipeline
        platforms={platforms}
        orders={[]}
        currentYear={2026}
        currentQuarter={2}
        onSign={onSign}
        weaponsById={weaponsById}
        initialOfferCat="missiles"
        initialView="offers"
      />,
    );
    const btn = screen.getByRole("button", { name: /restock all low/i });
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toMatch(/2/);
  });

  it("clicking Restock all low depots invokes onSign twice", async () => {
    const onSign = vi.fn().mockResolvedValue(undefined);
    render(
      <AcquisitionPipeline
        platforms={platforms}
        orders={[]}
        currentYear={2026}
        currentQuarter={2}
        onSign={onSign}
        weaponsById={weaponsById}
        initialOfferCat="missiles"
        initialView="offers"
      />,
    );
    const btn = screen.getByRole("button", { name: /restock all low/i });
    fireEvent.click(btn);
    // Wait for async sequencing
    await vi.runAllTimersAsync();
    expect(onSign).toHaveBeenCalledTimes(2);
    // First call should be for meteor at base 3 with qty 40
    expect(onSign.mock.calls[0][0]).toMatchObject({
      platform_id: "meteor",
      quantity: 40,
      preferred_base_id: 3,
      kind: "missile_batch",
    });
    // Second call for astra_mk1 at base 2 with qty 30
    expect(onSign.mock.calls[1][0]).toMatchObject({
      platform_id: "astra_mk1",
      quantity: 30,
      preferred_base_id: 2,
      kind: "missile_batch",
    });
  });
});
