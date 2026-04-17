import { describe, it, expect } from "vitest";

describe("vitest bootstrap", () => {
  it("arithmetic still works", () => {
    expect(2 + 2).toBe(4);
  });

  it("jsdom provides a document", () => {
    expect(typeof document).toBe("object");
    expect(document.body).toBeDefined();
  });
});
