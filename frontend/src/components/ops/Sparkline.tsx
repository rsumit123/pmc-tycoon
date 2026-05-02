export interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  ariaLabel?: string;
}

export function Sparkline({
  values, width = 100, height = 24,
  stroke = "#fbbf24", fill = "rgba(251,191,36,0.15)", ariaLabel,
}: SparklineProps) {
  if (values.length === 0) return <span className="text-xs opacity-50">—</span>;
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${i * step},${height - (v / max) * height}`).join(" ");
  const area = `0,${height} ${pts} ${(values.length - 1) * step},${height}`;
  return (
    <svg
      width={width}
      height={height}
      aria-label={ariaLabel}
      role="img"
      className="inline-block"
    >
      <polygon points={area} fill={fill} />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}
