import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SquadronCard } from "../SquadronCard";
import type { BaseSquadronSummary, Platform } from "../../../lib/types";

const sq: BaseSquadronSummary = {
  id: 17, name: "17 Sqn Golden Arrows", call_sign: "GA",
  platform_id: "rafale_f4", strength: 18, readiness_pct: 82,
  xp: 0, ace_name: null,
};
const platform: Platform = {
  id: "rafale_f4", name: "Rafale F4", origin: "FR", role: "multirole",
  generation: "4.5", combat_radius_km: 1850, payload_kg: 9500,
  rcs_band: "reduced", radar_range_km: 200, cost_cr: 4500, intro_year: 2020,
};

describe("SquadronCard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders name + platform + strength + readiness", () => {
    render(<SquadronCard squadron={sq} platform={platform} />);
    expect(screen.getByText(/17 Sqn Golden Arrows/)).toBeInTheDocument();
    expect(screen.getByText(/Rafale F4/)).toBeInTheDocument();
    expect(screen.getByText(/18/)).toBeInTheDocument();
    expect(screen.getByText(/82/)).toBeInTheDocument();
  });

  it("surfaces ace name when present", () => {
    render(<SquadronCard squadron={{ ...sq, ace_name: "Sqn Ldr X 'Vajra'" }}
                         platform={platform} />);
    expect(screen.getByText(/Vajra/)).toBeInTheDocument();
  });

  it("fires onLongPress after 400ms hold", () => {
    const onLongPress = vi.fn();
    render(<SquadronCard squadron={sq} platform={platform} onLongPress={onLongPress} />);
    const card = screen.getByRole("button");
    fireEvent.pointerDown(card, { pointerId: 1 });
    vi.advanceTimersByTime(450);
    fireEvent.pointerUp(card, { pointerId: 1 });
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });
});
