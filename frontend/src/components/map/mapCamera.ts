/** Camera poses for the Theater Command map. Pure data — the map instance
 * applies them via flyTo/easeTo, so everything here is unit-testable. */

export interface CameraPose {
  center: [number, number]; // [lng, lat]
  zoom: number;
  pitch: number;
  bearing: number;
}

/** Default pitch for the 3D theater view (0 when terrain3d is off). */
export const DEFAULT_PITCH = 55;
export const DEFAULT_BEARING = -8;

/** Swoop down onto a friendly base (BaseSheet opening). */
export function baseFocusPose(lon: number, lat: number): CameraPose {
  return { center: [lon, lat], zoom: 9.3, pitch: 62, bearing: 18 };
}

/** flyTo padding that keeps the focused base (and its parked minis) inside
 * the strip of map left visible above the bottom sheet (~72vh tall). The
 * base lands at ~20% of viewport height instead of dead center. */
export function baseFocusPadding(viewportHeight: number): { top: number; left: number; right: number; bottom: number } {
  return { top: 0, left: 0, right: 0, bottom: Math.round(viewportHeight * 0.6) };
}

export const NO_PADDING = { top: 0, left: 0, right: 0, bottom: 0 };

/** Frame a vignette AO — wider than a base focus so the sector reads. */
export function aoAlertPose(lon: number, lat: number): CameraPose {
  return { center: [lon, lat], zoom: 8.2, pitch: 60, bearing: 30 };
}

export interface FlyOpts extends CameraPose {
  duration: number;
  essential: boolean;
}

/** MapLibre flyTo options for a pose; snaps instantly under reduced motion. */
export function flyOptions(pose: CameraPose, reducedMotion: boolean): FlyOpts {
  return { ...pose, duration: reducedMotion ? 0 : 2600, essential: true };
}

/** Guarded matchMedia read (jsdom-safe). */
export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
