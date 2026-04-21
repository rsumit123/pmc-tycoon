import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { NotificationBell } from "../NotificationBell";
import { useCampaignStore } from "../../../store/campaignStore";
import type { Notification } from "../../../lib/types";

function seedStore(notifications: Notification[], readIds: Set<string>) {
  useCampaignStore.setState({
    notifications,
    readNotificationIds: readIds,
  } as never);
}

describe("NotificationBell", () => {
  it("renders bell with no badge when no unread", () => {
    seedStore([], new Set());
    render(
      <MemoryRouter>
        <NotificationBell campaignId={1} />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/0 unread/)).toBeTruthy();
  });

  it("shows unread count + rose color when unread warnings exist", () => {
    seedStore(
      [
        { id: "a", kind: "low_stock", severity: "warning", title: "t", body: "b", action_url: "/x", created_at: null },
        { id: "b", kind: "rd_completed", severity: "info", title: "t", body: "b", action_url: "/y", created_at: null },
      ],
      new Set(),
    );
    render(
      <MemoryRouter>
        <NotificationBell campaignId={1} />
      </MemoryRouter>,
    );
    const badge = screen.getByText("2");
    expect(badge.className).toContain("rose");
  });

  it("marks read items are excluded from count", () => {
    seedStore(
      [
        { id: "a", kind: "low_stock", severity: "warning", title: "t", body: "b", action_url: "/x", created_at: null },
      ],
      new Set(["a"]),
    );
    render(
      <MemoryRouter>
        <NotificationBell campaignId={1} />
      </MemoryRouter>,
    );
    expect(screen.queryByText("1")).toBeNull();
  });
});
