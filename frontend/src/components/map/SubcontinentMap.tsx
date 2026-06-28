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
      fitBoundsOptions: { padding: 12 },
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
      // Readiness gauge: a ring around the base dot that fills + colours by
      // average squadron readiness (good/ok/low), so base health reads at a glance.
      const ringColor =
        avgReady === null ? "#64748b"
        : avgReady >= 75 ? "#34d399"
        : avgReady >= 55 ? "#f59e0b"
        : "#fb7185";
      const frac = avgReady === null ? 0 : Math.max(0, Math.min(1, avgReady / 100));

      // Outer wrapper is a ~40px transparent hit area for reliable tapping.
      const wrap = document.createElement("div");
      wrap.className = "flex items-center justify-center";
      wrap.style.width = "44px";
      wrap.style.height = "44px";
      wrap.style.cursor = "pointer";

      // 24px relative container holds the readiness ring, the centre dot, and
      // the corner status badges.
      const dot = document.createElement("div");
      dot.className = "relative";
      dot.style.width = "24px";
      dot.style.height = "24px";
      wrap.appendChild(dot);

      // SVG readiness ring (track + arc).
      const NS = "http://www.w3.org/2000/svg";
      const R = 9;
      const CIRC = 2 * Math.PI * R;
      const ring = document.createElementNS(NS, "svg");
      ring.setAttribute("viewBox", "0 0 24 24");
      ring.setAttribute("width", "24");
      ring.setAttribute("height", "24");
      ring.style.position = "absolute";
      ring.style.inset = "0";
      ring.style.pointerEvents = "none";
      const track = document.createElementNS(NS, "circle");
      track.setAttribute("cx", "12"); track.setAttribute("cy", "12"); track.setAttribute("r", String(R));
      track.setAttribute("fill", "none"); track.setAttribute("stroke", "rgba(148,163,184,0.28)"); track.setAttribute("stroke-width", "2");
      ring.appendChild(track);
      if (frac > 0) {
        const arc = document.createElementNS(NS, "circle");
        arc.setAttribute("cx", "12"); arc.setAttribute("cy", "12"); arc.setAttribute("r", String(R));
        arc.setAttribute("fill", "none"); arc.setAttribute("stroke", ringColor); arc.setAttribute("stroke-width", "2.5");
        arc.setAttribute("stroke-linecap", "round");
        arc.setAttribute("stroke-dasharray", `${(CIRC * frac).toFixed(2)} ${CIRC.toFixed(2)}`);
        arc.setAttribute("transform", "rotate(-90 12 12)");
        ring.appendChild(arc);
      }
      dot.appendChild(ring);

      const el = document.createElement("button");
      el.type = "button";
      el.setAttribute("aria-label", `${b.name} airbase`);
      el.setAttribute("data-base-id", String(b.id));
      el.className = [
        "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border block transition-transform hover:scale-125",
        isFlash
          ? "w-3 h-3 bg-emerald-400 border-emerald-900 ring-2 ring-emerald-300/60 animate-pulse"
          : strained
          ? "w-2.5 h-2.5 bg-amber-400 border-amber-950 animate-pulse shadow-[0_0_7px_2px_rgba(245,158,11,0.5)]"
          : "w-2.5 h-2.5 bg-amber-400 border-amber-900 shadow-[0_0_6px_2px_rgba(245,158,11,0.45)]",
      ].join(" ");
      // Click on the full 44px hit area (not just the tiny dot) for reliable taps.
      wrap.addEventListener("click", () => onMarkerClick?.(b.id));
      dot.appendChild(el);

      const addDot = (color: string, pos: string, title: string) => {
        const d = document.createElement("span");
        d.title = title;
        d.className = `absolute w-1.5 h-1.5 rounded-full border border-slate-900 ${color} ${pos} pointer-events-none`;
        dot.appendChild(d);
      };
      if (hasAwacs) addDot("bg-emerald-400", "top-0 right-0", "AWACS");
      if (hasTanker) addDot("bg-orange-400", "bottom-0 right-0", "Tanker");
      if (hasAD) addDot("bg-yellow-300", "top-0 left-0", "AD battery");
      if (hasDrone) addDot("bg-sky-400", "bottom-0 left-0", "ISR/UCAV");

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
