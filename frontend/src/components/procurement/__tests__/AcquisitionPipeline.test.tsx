import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AcquisitionPipeline } from "../AcquisitionPipeline";
import type { Platform, AcquisitionOrder } from "../../../lib/types";

const platforms: Platform[] = [
  { id: "tejas_mk1a", name: "Tejas Mk1A", origin: "IND", role: "multirole",
    generation: "4.5", combat_radius_km: 500, payload_kg: 5300,
    rcs_band: "reduced", radar_range_km: 150, cost_cr: 500, intro_year: 2024,
    procurable_by: ["IND"], default_first_delivery_quarters: 8, default_foc_quarters: 16 },
  { id: "rafale_f5", name: "Rafale F5", origin: "FR", role: "multirole",
    generation: "4.75", combat_radius_km: 1900, payload_kg: 9500,
    rcs_band: "reduced", radar_range_km: 220, cost_cr: 5000, intro_year: 2030,
    procurable_by: ["IND"], default_first_delivery_quarters: 8, default_foc_quarters: 16 },
];

const orders: AcquisitionOrder[] = [
  { id: 1, platform_id: "rafale_f5", quantity: 36,
    signed_year: 2026, signed_quarter: 2,
    first_delivery_year: 2028, first_delivery_quarter: 4,
    foc_year: 2032, foc_quarter: 2,
    delivered: 0, total_cost_cr: 180000 },
];

describe("AcquisitionPipeline", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders offers for each platform with quantity + total cost", () => {
    render(
      <AcquisitionPipeline
        platforms={platforms}
        orders={[]}
        currentYear={2026}
        currentQuarter={2}
        onSign={() => {}}
      />,
    );
    expect(screen.getByText("Tejas Mk1A")).toBeInTheDocument();
    expect(screen.getByText("Rafale F5")).toBeInTheDocument();
    // Default quantity 16 → Tejas total 8,000 cr
    expect(screen.getByText(/8,000 cr/)).toBeInTheDocument();
  });

  it("updating quantity recomputes total cost", () => {
    render(
      <AcquisitionPipeline
        platforms={platforms}
        orders={[]}
        currentYear={2026}
        currentQuarter={2}
        onSign={() => {}}
      />,
    );
    const tejasCard = screen.getByText("Tejas Mk1A").closest("div")!;
    const incBtns = Array.from(tejasCard.querySelectorAll<HTMLButtonElement>(
      "[aria-label='increment']",
    ));
    expect(incBtns.length).toBeGreaterThan(0);
    fireEvent.click(incBtns[0]);  // +2 → 18
    fireEvent.click(incBtns[0]);  // +2 → 20
    // 20 * 500 cr = 10,000 cr
    expect(screen.getByText(/10,000 cr/)).toBeInTheDocument();
  });

  it("renders active orders in the timeline section", () => {
    render(
      <AcquisitionPipeline
        platforms={platforms}
        orders={orders}
        currentYear={2026}
        currentQuarter={2}
        onSign={() => {}}
      />,
    );
    // Rafale F5 appears in both Offers and Active orders now (multi-batch allowed)
    const rafaleEls = screen.getAllByText(/Rafale F5/);
    expect(rafaleEls.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/36/)).toBeInTheDocument();
  });

  it("fires onSign with the correct payload when Sign hold completes", () => {
    const onSign = vi.fn();
    render(
      <AcquisitionPipeline
        platforms={[platforms[0]]}
        orders={[]}
        currentYear={2026}
        currentQuarter={2}
        onSign={onSign}
      />,
    );
    const signBtn = screen.getByRole("button", { name: /hold|sign/i });
    fireEvent.pointerDown(signBtn, { pointerId: 1 });
    vi.advanceTimersByTime(2000);
    expect(onSign).toHaveBeenCalled();
    const [payload] = onSign.mock.calls[0];
    expect(payload.platform_id).toBe("tejas_mk1a");
    expect(payload.quantity).toBe(16);
    expect(payload.total_cost_cr).toBe(16 * 500);
    // currentYear=2026, currentQuarter=2, default_first_delivery_quarters=8
    // (2-1+8)=9 → year+2=2028, quarter=(9%4)+1=2
    expect(payload.first_delivery_year).toBe(2028);
    expect(payload.first_delivery_quarter).toBe(2);
    // default_foc_quarters=16: (2-1+16)=17 → year+4=2030, quarter=(17%4)+1=2
    expect(payload.foc_year).toBe(2030);
    expect(payload.foc_quarter).toBe(2);
  });
});
