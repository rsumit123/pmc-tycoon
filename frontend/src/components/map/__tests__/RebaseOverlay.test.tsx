import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RebaseOverlay } from "../RebaseOverlay";

const BASES = [
  { id: 1, template_id: "adampur", name: "Adampur", lat: 31.4, lon: 75.8, shelter_count: 18, fuel_depot_size: 2, ad_integration_level: 1, runway_class: "standard", squadrons: [] },
  { id: 2, template_id: "halwara", name: "Halwara", lat: 30.7, lon: 75.9, shelter_count: 18, fuel_depot_size: 2, ad_integration_level: 1, runway_class: "standard", squadrons: [] },
  { id: 3, template_id: "hasimara", name: "Hasimara", lat: 26.7, lon: 89.5, shelter_count: 18, fuel_depot_size: 2, ad_integration_level: 1, runway_class: "standard", squadrons: [] },
];

const SQN = { id: 1, name: "17 Sqn", call_sign: "GA", platform_id: "rafale_f4", strength: 18, readiness_pct: 80, xp: 0, ace_name: null };

describe("RebaseOverlay", () => {
  it("shows destination bases excluding current", () => {
    const onRebase = vi.fn();
    render(
      <RebaseOverlay
        squadron={SQN}
        bases={BASES}
        currentBaseId={1}
        onRebase={onRebase}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText("Halwara")).toBeDefined();
    expect(screen.getByText("Hasimara")).toBeDefined();
    expect(screen.queryByText("Adampur")).toBeNull();
  });

  it("calls onRebase with correct ids", () => {
    const onRebase = vi.fn();
    render(
      <RebaseOverlay
        squadron={SQN}
        bases={BASES}
        currentBaseId={1}
        onRebase={onRebase}
        onCancel={() => {}}
      />,
    );
    fireEvent.click(screen.getByText("Halwara"));
    expect(onRebase).toHaveBeenCalledWith(1, 2);
  });

  it("renders nothing when squadron is null", () => {
    const { container } = render(
      <RebaseOverlay
        squadron={null}
        bases={BASES}
        currentBaseId={1}
        onRebase={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container.innerHTML).toBe("");
  });
});
