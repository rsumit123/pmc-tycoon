export const FACTION_ANCHORS: Record<string, { lat: number; lon: number; name: string }> = {
  PAF: { lat: 32.05, lon: 72.67, name: "Sargodha / Mushaf AB" },
  PLAAF: { lat: 37.03, lon: 79.93, name: "Hotan AB" },
  PLAN: { lat: 18.20, lon: 109.60, name: "Yulin Naval Base" },
};

/**
 * Great-circle bearing from a faction's home anchor to a given AO.
 * Returns degrees in [0, 360). 0 = North, 90 = East.
 * "Bearing FROM faction TO AO" means: if you stood at the faction and looked toward the AO,
 *   this is the compass bearing. So the arrow on a map goes FROM anchor TO AO.
 *   The "attack comes from" direction is the reciprocal (bearing + 180) mod 360.
 */
export function bearingFromFactionToAO(
  faction: string,
  ao: { lat: number; lon: number }
): number {
  const anchor = FACTION_ANCHORS[faction];
  if (!anchor) return 0;

  const phi1 = (anchor.lat * Math.PI) / 180;
  const phi2 = (ao.lat * Math.PI) / 180;
  const dLambda = ((ao.lon - anchor.lon) * Math.PI) / 180;

  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);

  const theta = Math.atan2(y, x);
  return ((theta * 180) / Math.PI + 360) % 360;
}

export function bearingToCardinal(bearing: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return directions[Math.round(bearing / 45) % 8];
}
