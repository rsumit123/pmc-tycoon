export interface NatoSymbolProps {
  side: "ind" | "adv";
  platformId: string;
  alive: boolean;
  x: number;
  y: number;
  size?: number;
}

const SIDE_COLORS = {
  ind: { fill: "#3b82f6", stroke: "#1d4ed8" },
  adv: { fill: "#ef4444", stroke: "#b91c1c" },
};

export function NatoSymbol({ side, platformId, alive, x, y, size = 16 }: NatoSymbolProps) {
  const c = SIDE_COLORS[side];
  const half = size / 2;
  return (
    <g transform={`translate(${x},${y})`} opacity={alive ? 1.0 : 0.25}>
      <rect
        x={-half} y={-half} width={size} height={size}
        fill={c.fill} stroke={c.stroke} strokeWidth={1.5} rx={2}
      />
      {!alive && (
        <>
          <line x1={-half} y1={-half} x2={half} y2={half} stroke="#fff" strokeWidth={1.5} />
          <line x1={half} y1={-half} x2={-half} y2={half} stroke="#fff" strokeWidth={1.5} />
        </>
      )}
      <text
        y={size + 10} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={8}
      >
        {platformId.replace(/_/g, " ").slice(0, 8)}
      </text>
    </g>
  );
}
