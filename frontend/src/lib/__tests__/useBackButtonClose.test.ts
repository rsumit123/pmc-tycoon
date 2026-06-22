import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBackButtonClose } from "../useBackButtonClose";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

describe("useBackButtonClose", () => {
  it("is a no-op on web (does not throw)", () => {
    const onClose = vi.fn();
    expect(() =>
      renderHook(() => useBackButtonClose(true, onClose)),
    ).not.toThrow();
    expect(onClose).not.toHaveBeenCalled();
  });
});
