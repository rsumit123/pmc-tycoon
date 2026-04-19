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

const AWACS_PLATFORMS = new Set(["netra_aewc", "phalcon_a50", "netra_aewc_mk2"]);
const TANKER_PLATFORMS = new Set(["il78_tanker", "il78mki"]);
const DRONE_PLATFORMS = new Set(["tapas_uav", "ghatak_ucav"]);

export interface SubcontinentMapProps {
  markers: BaseMarker[];
  onMarkerClick?: (baseId: number) => void;
  onReady?: (map: MLMap) => void;
  flashBaseId?: number | null;
  adBaseIds?: Set<number>;
  className?: string;
}

export function SubcontinentMap({
  markers, onMarkerClick, onReady, flashBaseId, adBaseIds, className = "",
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
      const hasAwacs = b.squadrons.some((s) => AWACS_PLATFORMS.has(s.platform_id));
      const hasTanker = b.squadrons.some((s) => TANKER_PLATFORMS.has(s.platform_id));
      const hasDrone = b.squadrons.some((s) => DRONE_PLATFORMS.has(s.platform_id));
      const hasAD = adBaseIds?.has(b.id) ?? false;
      const isFlash = flashBaseId === b.id;

      const wrap = document.createElement("div");
      wrap.className = "relative";
      wrap.style.width = "12px";
      wrap.style.height = "12px";

      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${b.name} airbase`);
      el.setAttribute("data-base-id", String(b.id));
      el.className = [
        "w-3 h-3 rounded-full border shadow hover:scale-125 transition-transform block",
        isFlash
          ? "bg-emerald-400 border-emerald-900 ring-4 ring-emerald-300/60 animate-pulse scale-150"
          : "bg-amber-400 border-amber-900",
      ].join(" ");
      el.addEventListener("click", () => onMarkerClick?.(b.id));
      wrap.appendChild(el);

      const addDot = (color: string, pos: string, title: string) => {
        const d = document.createElement("span");
        d.title = title;
        d.className = `absolute w-1.5 h-1.5 rounded-full border border-slate-900 ${color} ${pos} pointer-events-none`;
        wrap.appendChild(d);
      };
      if (hasAwacs) addDot("bg-emerald-400", "-top-1 -right-1", "AWACS");
      if (hasTanker) addDot("bg-orange-400", "-bottom-1 -right-1", "Tanker");
      if (hasAD) addDot("bg-yellow-300", "-top-1 -left-1", "AD battery");
      if (hasDrone) addDot("bg-sky-400", "-bottom-1 -left-1", "ISR/UCAV");

      const mk = new maplibregl.Marker({ element: wrap })
        .setLngLat([b.lon, b.lat])
        .addTo(m);
      markerObjsRef.current.push(mk);
    }
  }, [markers, onMarkerClick, flashBaseId, adBaseIds]);

  return (
    <div
      ref={containerRef}
      className={["w-full h-full bg-slate-900 rounded-lg", className].join(" ")}
    />
  );
}
