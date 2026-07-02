import type { Vignette } from "../../lib/types";

export interface AOAlert {
  id: number;
  lat: number;
  lon: number;
  name: string;
}

/** AO of the first pending vignette, if any — drives the map alert marker. */
export function firstPendingAO(vignettes: Vignette[]): AOAlert | null {
  const v = vignettes[0];
  const ao = v?.planning_state?.ao;
  if (!v || !ao) return null;
  return { id: v.id, lat: ao.lat, lon: ao.lon, name: ao.name };
}
