import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Glossary } from "../Glossary";

describe("Glossary page", () => {
  it("lists glossary terms and filters by search", () => {
    render(<MemoryRouter><Glossary /></MemoryRouter>);
    expect(screen.getByText(/BVR \(Beyond Visual Range\)/)).toBeInTheDocument();
    // Assert on the AWACS *definition* (unique) — "AWACS" also appears inside
    // the BVR "why" text, so matching the term alone would be ambiguous.
    expect(screen.getByText(/flying radar command plane/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "stealth" } });
    expect(screen.getByText(/VLO \/ Stealth/)).toBeInTheDocument();
    expect(screen.queryByText(/BVR \(Beyond Visual Range\)/)).not.toBeInTheDocument();
  });
});
