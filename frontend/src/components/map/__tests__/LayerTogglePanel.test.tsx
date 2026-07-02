import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LayerTogglePanel } from "../LayerTogglePanel";
import { useMapStore } from "../../../store/mapStore";

describe("LayerTogglePanel terrain toggle", () => {
  it("renders the 3D terrain toggle and flips the store", () => {
    useMapStore.setState({ terrain3d: true });
    render(<LayerTogglePanel />);
    const btn = screen.getByRole("button", { name: /3d terrain/i });
    fireEvent.click(btn);
    expect(useMapStore.getState().terrain3d).toBe(false);
  });
});
