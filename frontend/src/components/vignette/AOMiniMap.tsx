import type { AoCoords, BaseMarker } from "../../lib/types";
import { bearingFromFactionToAO, bearingToCardinal, FACTION_ANCHORS } from "./attackAxis";

export interface AOMiniMapProps {
  ao: AoCoords;
  inRangeBases: BaseMarker[];
  faction: string;
}

// Approximate subcontinent bbox
const MIN_LAT = 5;
const MAX_LAT = 40;
const MIN_LON = 65;
const MAX_LON = 100;
const W = 320;
const H = 220;

function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon - MIN_LON) / (MAX_LON - MIN_LON)) * W;
  const y = H - ((lat - MIN_LAT) / (MAX_LAT - MIN_LAT)) * H;
  return { x, y };
}

export function AOMiniMap({ ao, inRangeBases, faction }: AOMiniMapProps) {
  const aoP = project(ao.lat, ao.lon);
  const anchor = FACTION_ANCHORS[faction];
  const bearing = bearingFromFactionToAO(faction, ao);
  // Attack comes FROM reciprocal bearing (i.e., if bearing-to-AO is 90°/east, enemy is east of AO; attack comes from the east).
  // The arrow on the map shows direction of attack: starts near AO on the reciprocal side, arrows TOWARD AO.
  const reciprocal = (bearing + 180) % 360;
  const cardinal = bearingToCardinal(reciprocal);
  // In SVG Y grows down. Convert bearing to dx/dy: start offset from AO along the anchor direction.
  // bearing here is FROM-faction-TO-AO; if bearing = 90 (AO east of faction), then anchor is west of AO.
  // So the arrow START is on the WEST side of AO.
  const bearingRad = (bearing * Math.PI) / 180;
  const arrowLen = 60;
  // Start position: move opposite to bearing direction from AO. Cos(bearing)=north component, sin(bearing)=east.
  // SVG y down -> invert north. So start.x = aoP.x - arrowLen*sin(bearing), start.y = aoP.y + arrowLen*cos(bearing).
  const startX = aoP.x - arrowLen * Math.sin(bearingRad);
  const startY = aoP.y + arrowLen * Math.cos(bearingRad);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-2">
      <div className="flex items-baseline justify-between mb-1">
        <div className="text-xs font-semibold text-slate-300">{ao.name}</div>
        <div className="text-[10px] text-red-300 uppercase">
          Attack from {cardinal}
          {anchor ? ` (${anchor.name})` : ""}
        </div>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full max-w-full"
        role="img"
        aria-label="AO mini-map"
      >
        <rect width={W} height={H} fill="#0a1224" />
        {inRangeBases.map((b) => {
          const p = project(b.lat, b.lon);
          return (
            <circle
              key={b.id}
              cx={p.x}
              cy={p.y}
              r={3}
              fill="#3b82f6"
              opacity={0.7}
            />
          );
        })}
        <defs>
          <marker
            id="arr"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
          </marker>
        </defs>
        <line
          x1={startX}
          y1={startY}
          x2={aoP.x}
          y2={aoP.y}
          stroke="#ef4444"
          strokeWidth={2.5}
          markerEnd="url(#arr)"
        />
        <circle cx={aoP.x} cy={aoP.y} r={6} fill="#ef4444" stroke="#fecaca" strokeWidth={1}>
          <animate
            attributeName="r"
            values="6;9;6"
            dur="1.5s"
            repeatCount="indefinite"
          />
        </circle>
        {/* N-pointer in corner */}
        <g transform="translate(8, 20)">
          <path d="M 0 10 L 5 0 L 10 10 L 5 7 Z" fill="#64748b" />
          <text x={5} y={24} textAnchor="middle" fill="#64748b" fontSize={8}>
            N
          </text>
        </g>
      </svg>
    </div>
  );
}
