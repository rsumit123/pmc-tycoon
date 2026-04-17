import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AirbasePanel } from "../AirbasePanel";
import { http } from "../../../lib/api";

const defaultProps = {
  campaignId: 1,
  baseTemplateId: "ambala",
  baseName: "Ambala Air Force Station",
  shelterCount: 0,
  fuelDepotSize: 1,
  adIntegrationLevel: 1,
  runwayClass: "medium",
  budgetCr: 50000,
  onUpgraded: vi.fn(),
};

describe("AirbasePanel", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders base name", () => {
    render(<AirbasePanel {...defaultProps} />);
    expect(screen.getByText("Ambala Air Force Station")).toBeTruthy();
  });

  it("renders all upgrade options", () => {
    render(<AirbasePanel {...defaultProps} />);
    expect(screen.getByText("Hardened Shelters")).toBeTruthy();
    expect(screen.getByText("Fuel Depot")).toBeTruthy();
    expect(screen.getByText("AD Integration")).toBeTruthy();
    expect(screen.getByText("Runway Class")).toBeTruthy();
  });

  it("renders current stats for each upgrade", () => {
    render(<AirbasePanel {...defaultProps} />);
    expect(screen.getByText("Current: 0 / 36")).toBeTruthy();
    expect(screen.getByText("Current: 1 / 5")).toBeTruthy();
    expect(screen.getByText("Current: 1 / 3")).toBeTruthy();
    expect(screen.getByText("Current: medium / heavy")).toBeTruthy();
  });

  it("disables all upgrade buttons when budget is insufficient", () => {
    render(<AirbasePanel {...defaultProps} budgetCr={100} />);
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("enables upgrade buttons when budget is sufficient", () => {
    render(<AirbasePanel {...defaultProps} budgetCr={50000} />);
    const upgradeButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.textContent === "Upgrade");
    expect(upgradeButtons.length).toBeGreaterThan(0);
    upgradeButtons.forEach((btn) => {
      expect(btn).not.toBeDisabled();
    });
  });

  it("shows Max label and disables button when at cap", () => {
    render(
      <AirbasePanel
        {...defaultProps}
        shelterCount={36}
        fuelDepotSize={5}
        adIntegrationLevel={3}
        runwayClass="heavy"
      />
    );
    const maxButtons = screen.getAllByRole("button").filter((btn) => btn.textContent === "Max");
    expect(maxButtons.length).toBe(4);
    maxButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });

  it("calls api.upgradeBase and onUpgraded on successful upgrade", async () => {
    const onUpgraded = vi.fn();
    vi.spyOn(http, "post").mockResolvedValueOnce({
      data: {
        base_template_id: "ambala",
        upgrade_type: "shelter",
        cost_cr: 5000,
        shelter_count: 4,
        fuel_depot_size: 1,
        ad_integration_level: 1,
        runway_class: "medium",
        remaining_budget_cr: 45000,
      },
    } as never);

    render(<AirbasePanel {...defaultProps} onUpgraded={onUpgraded} />);

    const shelterButton = screen
      .getAllByRole("button")
      .find((btn) => {
        const card = btn.closest("div[class*='rounded']");
        return card?.textContent?.includes("Hardened Shelters") && btn.textContent === "Upgrade";
      });

    expect(shelterButton).toBeTruthy();
    await userEvent.click(shelterButton!);

    expect(http.post).toHaveBeenCalledWith(
      "/api/campaigns/1/bases/ambala/upgrade",
      { upgrade_type: "shelter" }
    );
    expect(onUpgraded).toHaveBeenCalled();
  });

  it("shows treasury amount", () => {
    render(<AirbasePanel {...defaultProps} budgetCr={155000} />);
    expect(screen.getByText(/155,000/)).toBeTruthy();
  });
});
