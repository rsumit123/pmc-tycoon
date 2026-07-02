import type { ADBattery, BaseMarker } from "../../lib/types";
import { domeMercatorParams, type DomeParams } from "./domeGeometry";

export interface DomeSpec extends DomeParams {
  key: number; // battery id
}

/** One dome per AD battery, positioned/scaled in mercator space. */
export function buildDomeSpecs(bases: BaseMarker[], batteries: ADBattery[]): DomeSpec[] {
  const baseById = new Map(bases.map((b) => [b.id, b]));
  const specs: DomeSpec[] = [];
  for (const bat of batteries) {
    const base = baseById.get(bat.base_id);
    if (!base) continue;
    specs.push({ key: bat.id, ...domeMercatorParams(base.lon, base.lat, bat.coverage_km) });
  }
  return specs;
}
