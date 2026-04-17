import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import type { BaseMarker } from "../../lib/types";
import { subcontinentBounds } from "./markerProjection";

const OSM_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
};

export interface SubcontinentMapProps {
  markers: BaseMarker[];
  onMarkerClick?: (baseId: number) => void;
  onReady?: (map: MLMap) => void;
  className?: string;
}

export function SubcontinentMap({
  markers, onMarkerClick, onReady, className = "",
}: SubcontinentMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markerObjsRef = useRef<Marker[]>([]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const b = subcontinentBounds();
    const m = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      bounds: [[b.west, b.south], [b.east, b.north]],
      fitBoundsOptions: { padding: 40 },
    });
    mapRef.current = m;
    m.on("load", () => onReady?.(m));
    return () => {
      m.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = mapRef.current;
    if (!m) return;
    markerObjsRef.current.forEach((mk) => mk.remove());
    markerObjsRef.current = [];
    for (const b of markers) {
      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${b.name} airbase`);
      el.className =
        "w-3 h-3 rounded-full bg-amber-400 border border-amber-900 " +
        "shadow hover:scale-125 transition-transform";
      el.addEventListener("click", () => onMarkerClick?.(b.id));
      const mk = new maplibregl.Marker({ element: el })
        .setLngLat([b.lon, b.lat])
        .addTo(m);
      markerObjsRef.current.push(mk);
    }
  }, [markers, onMarkerClick]);

  return (
    <div
      ref={containerRef}
      className={["w-full h-full bg-slate-900 rounded-lg", className].join(" ")}
    />
  );
}
