import { useEffect, useRef } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import type { BaseMarker } from "../../lib/types";
import { subcontinentBounds } from "./markerProjection";

// Dark "command chart" basemap (Carto dark-matter) — matches the app's
// tactical theme far better than the bright default OSM raster. Free for this
// scale with OSM + CARTO attribution.
const MAP_STYLE = {
  version: 8 as const,
  sources: {
    carto: {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
    },
  },
  layers: [{ id: "carto", type: "raster" as const, source: "carto" }],
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
      style: MAP_STYLE,
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
      // "Strained" = average squadron readiness below the amber tier — pulse it
      // rose so the eye is drawn to bases that need attention.
      const avgReady = b.squadrons.length
        ? b.squadrons.reduce((a, s) => a + s.readiness_pct, 0) / b.squadrons.length
        : null;
      const strained = avgReady !== null && avgReady < 55;

      // Outer wrapper is a ~40px transparent hit area centered around the 12px
      // visual dot, so tapping a base (the primary nav action) is reliable on
      // touch screens while the dot still reads as 12px.
      const wrap = document.createElement("div");
      wrap.className = "flex items-center justify-center";
      wrap.style.width = "40px";
      wrap.style.height = "40px";

      // Inner 12px relative container keeps the corner status badges anchored to
      // the visual dot rather than the enlarged hit area.
      const dot = document.createElement("div");
      dot.className = "relative w-3 h-3";
      wrap.appendChild(dot);

      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${b.name} airbase`);
      el.setAttribute("data-base-id", String(b.id));
      el.className = [
        "w-3 h-3 rounded-full border block transition-transform hover:scale-125",
        isFlash
          ? "bg-emerald-400 border-emerald-900 ring-4 ring-emerald-300/60 animate-pulse scale-150"
          : strained
          ? "bg-rose-400 border-rose-950 ring-2 ring-rose-300/50 animate-pulse shadow-[0_0_9px_2px_rgba(244,63,94,0.55)]"
          : "bg-amber-400 border-amber-900 ring-2 ring-amber-300/40 shadow-[0_0_8px_2px_rgba(245,158,11,0.45)]",
      ].join(" ");
      el.addEventListener("click", () => onMarkerClick?.(b.id));
      dot.appendChild(el);

      const addDot = (color: string, pos: string, title: string) => {
        const d = document.createElement("span");
        d.title = title;
        d.className = `absolute w-1.5 h-1.5 rounded-full border border-slate-900 ${color} ${pos} pointer-events-none`;
        dot.appendChild(d);
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
      // Lift the near-black Carto dark tiles to a readable charcoal so the map
      // doesn't feel oppressively dark, while staying on-theme.
      className={["w-full h-full bg-slate-900 rounded-lg brightness-[1.35] contrast-[0.92]", className].join(" ")}
    />
  );
}
