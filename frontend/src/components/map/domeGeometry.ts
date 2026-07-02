/** Web-Mercator helpers for placing 3D volumes on the MapLibre map.
 * Local implementation (identical math to maplibre's MercatorCoordinate)
 * so the module is pure and jsdom-testable. */

const EARTH_CIRCUMFERENCE_M = 40075016.686;

export function mercatorX(lng: number): number {
  return (180 + lng) / 360;
}

export function mercatorY(lat: number): number {
  return (
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360
  );
}

/** Mercator units per meter at a latitude (units shrink toward the poles). */
export function metersToMercator(lat: number): number {
  return 1 / (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180));
}

export interface DomeParams {
  x: number; // mercator
  y: number; // mercator
  scale: number; // mercator units per dome-geometry unit (unit hemisphere radius)
}

/** Position + scale for a unit-radius hemisphere covering `radiusKm` around a point. */
export function domeMercatorParams(lon: number, lat: number, radiusKm: number): DomeParams {
  return {
    x: mercatorX(lon),
    y: mercatorY(lat),
    scale: radiusKm * 1000 * metersToMercator(lat),
  };
}
