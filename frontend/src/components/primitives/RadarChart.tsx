export interface RadarChartAxis {
  label: string;
  value: number;
}

export interface RadarChartProps {
  axes: RadarChartAxis[];
  size?: number;
  fillOpacity?: number;
  color?: string;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export function RadarChart({
  axes,
  size = 240,
  fillOpacity = 0.3,
  color = "#f59e0b",
}: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 32;
  const n = axes.length;

  const pointFor = (axisIdx: number, valueFraction: number) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * axisIdx) / n;
    const r = radius * clamp01(valueFraction);
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  };

  const polygonPoints = axes
    .map((a, i) => {
      const p = pointFor(i, a.value);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    })
    .join(" ");

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg width={size} height={size} role="img" aria-label="stat radar chart">
      {rings.map((r, i) => {
        const pts = axes
          .map((_, axisIdx) => {
            const p = pointFor(axisIdx, r);
            return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
          })
          .join(" ");
        return (
          <polygon
            key={i}
            points={pts}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth={1}
          />
        );
      })}
      {axes.map((_, i) => {
        const outer = pointFor(i, 1);
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={outer.x} y2={outer.y}
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={1}
          />
        );
      })}
      <polygon
        points={polygonPoints}
        fill={color}
        fillOpacity={fillOpacity}
        stroke={color}
        strokeWidth={1.5}
      />
      {axes.map((axis, i) => {
        const outer = pointFor(i, 1.1);
        return (
          <text
            key={axis.label}
            x={outer.x}
            y={outer.y}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fill="rgba(230,237,243,0.85)"
          >
            {axis.label}
          </text>
        );
      })}
    </svg>
  );
}
