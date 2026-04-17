// frontend/src/components/intel/__tests__/IntelCard.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntelCard } from "../IntelCard";
import type { IntelCard as IntelCardType } from "../../../lib/types";

const fixture: IntelCardType = {
  id: 42,
  appeared_year: 2027,
  appeared_quarter: 2,
  source_type: "HUMINT",
  confidence: 0.62,
  truth_value: true,
  payload: {
    headline: "PLAAF rotates J-20 squadron to Hotan",
    template_id: "base_rotation_j20",
    subject_faction: "PLAAF",
    subject_type: "base_rotation",
    observed: { base: "Hotan", squadron_size: 12 },
    ground_truth: { base: "Hotan", squadron_size: 12 },
  },
};

describe("IntelCard", () => {
  it("renders headline + source + faction + confidence", () => {
    render(<IntelCard card={fixture} />);
    expect(screen.getByText(/PLAAF rotates J-20 squadron to Hotan/)).toBeTruthy();
    expect(screen.getByText(/HUMINT/)).toBeTruthy();
    expect(screen.getByText(/62%/)).toBeTruthy();
  });

  it("does NOT surface truth_value to the player", () => {
    render(<IntelCard card={fixture} />);
    expect(screen.queryByText(/truth/i)).toBeNull();
  });
});
