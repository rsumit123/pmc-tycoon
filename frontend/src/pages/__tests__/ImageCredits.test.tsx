import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ImageCredits } from "../ImageCredits";

const SAMPLE = [
  { id: "rafale_f4", attribution: "Dassault Rafale — Wikimedia Commons", author: "Tim Felce", license: "CC BY-SA 2.0", source_url: "https://commons.wikimedia.org/wiki/File:Rafale.jpg" },
];

describe("ImageCredits", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(SAMPLE) })) as never);
  });

  it("lists each image's attribution, author, license, and a source link", async () => {
    render(<MemoryRouter><ImageCredits /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText(/Dassault Rafale/)).toBeInTheDocument());
    expect(screen.getByText(/Tim Felce/)).toBeInTheDocument();
    expect(screen.getByText(/CC BY-SA 2\.0/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /source/i }) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("commons.wikimedia.org");
  });
});
