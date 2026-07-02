import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import type { Vignette } from "../../lib/types";
import { firstPendingAO } from "./aoAlert";
import { aoAlertPose, flyOptions, prefersReducedMotion } from "./mapCamera";

export interface AOAlertLayerProps {
  map: MLMap | null;
  pendingVignettes: Vignette[];
}

/** Red pulsing marker at the AO of the first pending vignette. Flies the
 * camera to it once per vignette id (not on every re-render). */
export function AOAlertLayer({ map, pendingVignettes }: AOAlertLayerProps) {
  const markerRef = useRef<Marker | null>(null);
  const flownForRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!map) return;
    const alert = firstPendingAO(pendingVignettes);
    markerRef.current?.remove();
    markerRef.current = null;
    if (!alert) return;

    const el = document.createElement("div");
    el.title = `Vignette AO — ${alert.name}`;
    el.className = "relative h-7 w-7 pointer-events-none";
    el.innerHTML =
      '<span class="absolute inset-0 rounded-full bg-rose-500/40 animate-ping"></span>' +
      '<span class="absolute inset-1 rounded-full border-2 border-rose-400"></span>';
    markerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([alert.lon, alert.lat])
      .addTo(map);

    if (!flownForRef.current.has(alert.id)) {
      flownForRef.current.add(alert.id);
      map.flyTo(flyOptions(aoAlertPose(alert.lon, alert.lat), prefersReducedMotion()));
    }
    return () => {
      markerRef.current?.remove();
      markerRef.current = null;
    };
  }, [map, pendingVignettes]);

  return null;
}
