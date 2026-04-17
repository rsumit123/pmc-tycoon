import type { YearSnapshot } from "../../lib/types";

export interface ForceEvolutionChartProps {
  snapshots: YearSnapshot[];
  width?: number;
  height?: number;
}

export function ForceEvolutionChart({
  snapshots,
  width = 360,
  height = 140,
}: ForceEvolutionChartProps) {
  const padX = 36;
  const padY = 20;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  if (snapshots.length === 0) {
    return (
      <svg width={width} height={height} role="img" aria-label="force evolution chart">
        <text x={width / 2} y={height / 2} textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize={12}>
          No data
        </text>
      </svg>
    );
  }

  const values = snapshots.map((s) => s.end_treasury_cr);
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const points = snapshots
    .map((s, i) => {
      const x = padX + (i / Math.max(snapshots.length - 1, 1)) * plotW;
      const y = padY + plotH - ((s.end_treasury_cr - minVal) / range) * plotH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const labelStep = Math.max(1, Math.floor(snapshots.length / 5));

  return (
    <svg width={width} height={height} role="img" aria-label="force evolution chart">
      <polyline
        points={points}
        fill="none"
        stroke="#f59e0b"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {snapshots.map((s, i) => {
        if (i % labelStep !== 0 && i !== snapshots.length - 1) return null;
        const x = padX + (i / Math.max(snapshots.length - 1, 1)) * plotW;
        return (
          <text
            key={s.year}
            x={x}
            y={height - 2}
            textAnchor="middle"
            fill="rgba(255,255,255,0.5)"
            fontSize={10}
          >
            {s.year}
          </text>
        );
      })}
    </svg>
  );
}
