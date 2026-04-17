// frontend/src/components/intel/__tests__/IntelSwipeStack.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { IntelSwipeStack } from "../IntelSwipeStack";
import type { IntelCard as IntelCardType } from "../../../lib/types";

const make = (id: number, headline: string): IntelCardType => ({
  id, appeared_year: 2027, appeared_quarter: 2,
  source_type: "SIGINT", confidence: 0.5, truth_value: true,
  payload: { headline, template_id: "t", subject_faction: "PAF", subject_type: "force_count", observed: {}, ground_truth: {} },
});

describe("IntelSwipeStack", () => {
  it("renders the first card on top", () => {
    const cards = [make(1, "first"), make(2, "second")];
    render(<IntelSwipeStack cards={cards} />);
    expect(screen.getAllByText(/first/).length).toBeGreaterThan(0);
  });

  it("renders empty state when no cards", () => {
    render(<IntelSwipeStack cards={[]} />);
    expect(screen.getByText(/No intel/i)).toBeTruthy();
  });
});
