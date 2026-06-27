import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Glossary } from "../Glossary";

describe("Glossary page", () => {
  it("lists glossary terms and filters by search", () => {
    render(<MemoryRouter><Glossary /></MemoryRouter>);
    expect(screen.getByText(/BVR \(Beyond Visual Range\)/)).toBeInTheDocument();
    expect(screen.getByText(/AWACS/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/search/i), { target: { value: "stealth" } });
    expect(screen.getByText(/VLO \/ Stealth/)).toBeInTheDocument();
    expect(screen.queryByText(/BVR \(Beyond Visual Range\)/)).not.toBeInTheDocument();
  });
});
