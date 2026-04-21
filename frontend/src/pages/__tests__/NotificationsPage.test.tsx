import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { NotificationsPage } from "../NotificationsPage";
import { useCampaignStore } from "../../store/campaignStore";
import type { Notification } from "../../lib/types";

const sample: Notification[] = [
  {
    id: "low_stock:1:meteor",
    kind: "low_stock",
    severity: "warning",
    title: "Meteor depot low at Ambala",
    body: "14 / 72",
    action_url: "/campaign/1/procurement",
    created_at: null,
  },
  {
    id: "event:99",
    kind: "rd_completed",
    severity: "info",
    title: "AMCA complete",
    body: "Procure via Acquisitions",
    action_url: "/campaign/1/armory",
    created_at: "2027-Q2",
  },
];

describe("NotificationsPage", () => {
  beforeEach(() => {
    useCampaignStore.setState({
      notifications: sample,
      readNotificationIds: new Set(),
      loadNotifications: vi.fn().mockResolvedValue(undefined),
      markNotificationRead: vi.fn((id: string) => {
        useCampaignStore.setState((s) => ({
          readNotificationIds: new Set([...s.readNotificationIds, id]),
        } as never));
      }),
    } as never);
  });

  it("renders warning + info when filter=all", () => {
    render(
      <MemoryRouter initialEntries={["/campaign/1/notifications"]}>
        <Routes>
          <Route path="/campaign/:id/notifications" element={<NotificationsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText(/Meteor depot low/)).toBeTruthy();
    expect(screen.getByText(/AMCA complete/)).toBeTruthy();
  });

  it("warnings filter hides info entries", () => {
    render(
      <MemoryRouter initialEntries={["/campaign/1/notifications"]}>
        <Routes>
          <Route path="/campaign/:id/notifications" element={<NotificationsPage />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^warnings/i }));
    expect(screen.getByText(/Meteor depot low/)).toBeTruthy();
    expect(screen.queryByText(/AMCA complete/)).toBeNull();
  });
});
