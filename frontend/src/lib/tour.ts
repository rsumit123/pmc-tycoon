import type { CoachStep } from "../components/onboarding/CoachMarks";

const KEY = "tutorial_seen_v1";

export const MAP_TOUR_STEPS: CoachStep[] = [
  { targetId: "map-statusbar", title: "Your command status", body: "Treasury, your net budget per quarter, and outstanding orders live up here. Tap any underlined term anywhere to learn what it means." },
  { targetId: "map-menu", title: "Everything lives here", body: "Open this menu for Procurement (budget, R&D, buying jets), your Hangar, Intel, and more." },
  { targetId: "map-endturn", title: "Advance the quarter", body: "When you're done planning, End Turn moves time forward. Sometimes a combat event will fire — you'll be guided through it." },
];

export function isTourSeen(): boolean {
  try { return localStorage.getItem(KEY) === "1"; } catch { return false; }
}
export function markTourSeen(): void {
  try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
}
export function resetTour(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
