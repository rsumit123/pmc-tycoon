import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlatformDossier } from "../PlatformDossier";
import type { Platform } from "../../../lib/types";

const platform: Platform = {
  id: "rafale_f4", name: "Dassault Rafale F4", origin: "FR", role: "multirole",
  generation: "4.5", combat_radius_km: 1850, payload_kg: 9500,
  rcs_band: "reduced", radar_range_km: 200, cost_cr: 4500, intro_year: 2020,
  procurable_by: ["IND"], default_first_delivery_quarters: 8, default_foc_quarters: 16,
};

describe("PlatformDossier", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <PlatformDossier platform={platform} open={false} onClose={() => {}} />,
    );
    expect(container.textContent).toBe("");
  });

  it("renders the platform name + stats when open", () => {
    render(<PlatformDossier platform={platform} open onClose={() => {}} />);
    expect(screen.getByText("Dassault Rafale F4")).toBeInTheDocument();
    expect(screen.getByText(/multirole/i)).toBeInTheDocument();
    expect(screen.getByText(/FR/)).toBeInTheDocument();
  });

  it("close button fires onClose", () => {
    const onClose = vi.fn();
    render(<PlatformDossier platform={platform} open onClose={onClose} />);
    fireEvent.click(screen.getByLabelText(/close/i));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
