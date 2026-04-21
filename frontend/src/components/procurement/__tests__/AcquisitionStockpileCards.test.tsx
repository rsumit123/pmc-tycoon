import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  MissileBatchOfferCard,
  ADBatteryOfferCard,
  ADReloadOfferCard,
} from "../AcquisitionPipeline";
import type {
  MissileUnlock, ADSystemUnlock, ADBattery, BaseMarker,
} from "../../../lib/types";

const bases: BaseMarker[] = [
  {
    id: 7, template_id: "ambala", name: "Ambala", lat: 30, lon: 76,
    shelter_count: 10, fuel_depot_size: 3, ad_integration_level: 2,
    runway_class: "long", squadrons: [],
  },
];

describe("MissileBatchOfferCard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const missile: MissileUnlock = {
    target_id: "meteor", name: "Meteor", description: "long-range BVR",
    eligible_platforms: ["rafale_f4"], nez_km: 80, max_range_km: 150,
    weapon_class: "a2a_bvr",
  };

  it("renders and submits a missile_batch payload", () => {
    const onSign = vi.fn();
    render(
      <MissileBatchOfferCard
        missile={missile}
        unitCostCr={18}
        currentYear={2026}
        currentQuarter={2}
        bases={bases}
        onSign={onSign}
      />,
    );
    expect(screen.getByText("Meteor")).toBeInTheDocument();
    // Pick base
    const select = screen.getByLabelText(/Meteor delivery base/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "7" } });
    const btn = screen.getByRole("button", { name: /hold to sign/i });
    fireEvent.pointerDown(btn, { pointerId: 1 });
    vi.advanceTimersByTime(2000);
    expect(onSign).toHaveBeenCalledTimes(1);
    const [payload] = onSign.mock.calls[0];
    expect(payload.kind).toBe("missile_batch");
    expect(payload.platform_id).toBe("meteor");
    expect(payload.quantity).toBe(50);
    expect(payload.total_cost_cr).toBe(50 * 18);
    expect(payload.preferred_base_id).toBe(7);
  });
});

describe("ADBatteryOfferCard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const system: ADSystemUnlock = {
    target_id: "akash_ng", name: "Akash-NG", description: "",
    coverage_km: 80, install_cost_cr: 500, max_pk: 0.7,
  };

  it("renders and submits an ad_battery payload with computed total cost", () => {
    const onSign = vi.fn();
    render(
      <ADBatteryOfferCard
        system={system}
        currentYear={2026}
        currentQuarter={2}
        bases={bases}
        onSign={onSign}
      />,
    );
    expect(screen.getByText("Akash-NG")).toBeInTheDocument();
    const select = screen.getByLabelText(/Akash-NG install base/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "7" } });
    const btn = screen.getByRole("button", { name: /hold to sign/i });
    fireEvent.pointerDown(btn, { pointerId: 1 });
    vi.advanceTimersByTime(2000);
    expect(onSign).toHaveBeenCalled();
    const [payload] = onSign.mock.calls[0];
    expect(payload.kind).toBe("ad_battery");
    expect(payload.platform_id).toBe("akash_ng");
    expect(payload.quantity).toBe(1);
    // install 500 + 24 * 3 = 572
    expect(payload.total_cost_cr).toBe(500 + 24 * 3);
    expect(payload.preferred_base_id).toBe(7);
  });
});

describe("ADReloadOfferCard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const battery: ADBattery = {
    id: 42, base_id: 7, system_id: "s400",
    coverage_km: 400, installed_year: 2026, installed_quarter: 2,
    interceptor_stock: 8,
  };

  it("renders fleet stock summary and submits ad_reload targeting lowest-stock battery", () => {
    const onSign = vi.fn();
    render(
      <ADReloadOfferCard
        systemId="s400"
        batteries={[battery]}
        baseNameById={{ 7: "Ambala" }}
        currentYear={2026}
        currentQuarter={2}
        onSign={onSign}
      />,
    );
    expect(screen.getByText(/S-400 Triumf/)).toBeInTheDocument();
    // Single battery → inline "Target" row instead of dropdown
    expect(screen.getByText(/Ambala/)).toBeInTheDocument();
    // Fleet summary line shows "8/16 across 1 battery"
    expect(screen.getByText(/fleet:/)).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: /hold to sign/i });
    fireEvent.pointerDown(btn, { pointerId: 1 });
    vi.advanceTimersByTime(2000);
    expect(onSign).toHaveBeenCalled();
    const [payload] = onSign.mock.calls[0];
    expect(payload.kind).toBe("ad_reload");
    expect(payload.platform_id).toBe("s400");
    expect(payload.target_battery_id).toBe(42);
    // default qty = max(4, capacity/2)=8, perShot=17 → 136
    expect(payload.quantity).toBe(8);
    expect(payload.total_cost_cr).toBe(8 * 17);
  });
});
