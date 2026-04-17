export function PlatformSilhouette({ size = 180 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size * 0.6}
      viewBox="0 0 200 120"
      role="img"
      aria-label="platform silhouette"
    >
      <g fill="rgba(230,237,243,0.55)" stroke="rgba(230,237,243,0.3)">
        <ellipse cx={100} cy={60} rx={80} ry={6} />
        <polygon points="40,60 160,60 140,75 60,75" />
        <polygon points="180,60 195,50 195,70" />
        <circle cx={60} cy={60} r={4} fill="rgba(15,23,42,0.8)" />
      </g>
    </svg>
  );
}
