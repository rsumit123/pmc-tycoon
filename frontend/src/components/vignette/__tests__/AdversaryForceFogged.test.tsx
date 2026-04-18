import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdversaryForceFogged } from "../AdversaryForceFogged";

describe("AdversaryForceFogged", () => {
  it("low tier shows count range, no platform names", () => {
    render(<AdversaryForceFogged observed={[{
      faction: "PLAAF", count_range: [4, 12], probable_platforms: [], fidelity: "low",
    }]} tier="low" score={0.2} />);
    expect(screen.getByText(/4-12/)).toBeTruthy();
    expect(screen.getByText(/Unknown composition/i)).toBeTruthy();
  });

  it("medium tier shows count range + probable platform", () => {
    render(<AdversaryForceFogged observed={[{
      faction: "PLAAF", role: "CAP", count_range: [4, 8], probable_platforms: ["j20a"], fidelity: "medium",
    }]} tier="medium" score={0.5} />);
    expect(screen.getByText(/4-8/)).toBeTruthy();
    expect(screen.getByText(/j20a/i)).toBeTruthy();
  });

  it("high tier shows exact count + probable platform", () => {
    render(<AdversaryForceFogged observed={[{
      faction: "PLAAF", role: "CAP", count: 6, probable_platforms: ["j20a"], fidelity: "high",
    }]} tier="high" score={0.75} />);
    expect(screen.getByText(/6×/)).toBeTruthy();
    expect(screen.getByText(/j20a/i)).toBeTruthy();
  });

  it("shows tier label and percent score", () => {
    render(<AdversaryForceFogged observed={[]} tier="medium" score={0.55} />);
    expect(screen.getByText(/Partial Intel/i)).toBeTruthy();
    expect(screen.getByText(/55%/)).toBeTruthy();
  });
});
