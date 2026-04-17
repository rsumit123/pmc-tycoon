import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom does not ship a real PointerEvent constructor that propagates clientX/clientY.
// Polyfill it so fireEvent.pointerDown/Move/Up work correctly in component tests.
if (typeof window !== "undefined" && typeof window.PointerEvent === "undefined") {
  class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? "mouse";
      this.isPrimary = params.isPrimary ?? false;
    }
  }
  // @ts-expect-error — intentional polyfill for jsdom test environment
  window.PointerEvent = PointerEvent;
}

afterEach(() => {
  cleanup();
});

// Override rAF so it runs via setTimeout — fake timers can then advance it.
globalThis.requestAnimationFrame = (cb: FrameRequestCallback) =>
  setTimeout(() => cb(performance.now()), 16) as unknown as number;
globalThis.cancelAnimationFrame = (id: number) =>
  clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
