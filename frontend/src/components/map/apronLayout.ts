/** Deterministic parking arrangement for squadron minis around a base. */

const HEAVIES = new Set(["su30_mki", "il78_tanker", "netra_aewc"]);
const ARC_START_DEG = 140; // bearing of first slot (SE of base)
const ARC_SWEEP_DEG = 80;
const APRON_DISTANCE_KM = 4.5;

export interface ApronSlot {
  platformId: string;
  lon: number;
  lat: number;
  yawDeg: number;
  spanM: number;
}

/** Distinct platforms (order-stable, capped) parked in an arc south of the base. */
export function apronSlots(
  baseLon: number,
  baseLat: number,
  platformIds: string[],
  cap = 4,
): ApronSlot[] {
  const distinct = [...new Set(platformIds)].slice(0, cap);
  const n = distinct.length;
  return distinct.map((platformId, i) => {
    const bearing = ARC_START_DEG + (n > 1 ? (i * ARC_SWEEP_DEG) / (n - 1) : ARC_SWEEP_DEG / 2);
    const rad = (bearing * Math.PI) / 180;
    const dLat = (APRON_DISTANCE_KM / 110.574) * Math.cos(rad);
    const dLon = (APRON_DISTANCE_KM / (111.32 * Math.cos((baseLat * Math.PI) / 180))) * Math.sin(rad);
    return {
      platformId,
      lon: baseLon + dLon,
      lat: baseLat + dLat,
      yawDeg: bearing + 65,
      spanM: HEAVIES.has(platformId) ? 5200 : 4300,
    };
  });
}
