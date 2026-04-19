import type { IntelCard } from "./types";
import type { IntelContact } from "../components/map/IntelContactsLayer";

const FACTION_CENTERS: Record<string, { lat: number; lng: number }> = {
  PLAAF: { lat: 34.0, lng: 78.5 },
  PAF: { lat: 30.5, lng: 72.5 },
  PLAN: { lat: 5.0, lng: 80.0 },
};

const JITTER = 2.0;

function jitter(base: number, seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return base + ((hash % 100) / 100 - 0.5) * JITTER;
}

export function synthesizeContacts(cards: IntelCard[]): IntelContact[] {
  const contacts: IntelContact[] = [];
  for (const card of cards) {
    const faction = card.payload?.subject_faction as string | undefined;
    if (!faction || !FACTION_CENTERS[faction]) continue;
    const center = FACTION_CENTERS[faction];
    const payload = (card.payload ?? {}) as unknown as Record<string, unknown>;
    const headline = (payload.headline as string | undefined)
      ?? (payload.summary as string | undefined)
      ?? undefined;
    contacts.push({
      id: `intel-${card.id}`,
      lat: jitter(center.lat, `${card.id}-lat`),
      lng: jitter(center.lng, `${card.id}-lng`),
      confidence: card.confidence,
      source_type: card.source_type,
      faction,
      headline,
    });
  }
  return contacts;
}
