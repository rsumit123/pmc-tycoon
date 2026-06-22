import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlatformImage } from "../PlatformImage";

describe("PlatformImage", () => {
  it("renders an image whose src points at the platform hero webp", () => {
    render(<PlatformImage platformId="rafale_f4" name="Rafale" />);
    const img = screen.getByAltText("Rafale") as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("platforms/rafale_f4/hero.webp");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("falls back to the silhouette when the image errors", () => {
    render(<PlatformImage platformId="missing_x" name="Missing" />);
    fireEvent.error(screen.getByAltText("Missing"));
    expect(screen.queryByAltText("Missing")).toBeNull();
    expect(screen.getByTestId("platform-image-fallback")).toBeInTheDocument();
  });
});
