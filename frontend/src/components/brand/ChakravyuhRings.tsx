// The chakravyuh — concentric defensive formation rings — as an ambient backdrop.
// Shared by the Login + Landing screens for brand cohesion.
export function ChakravyuhRings() {
  const markers = [0, 60, 120, 180, 240, 300];
  return (
    <svg
      viewBox="0 0 400 400"
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[150vw] max-w-[680px] -translate-x-1/2 -translate-y-1/2 select-none"
    >
      <defs>
        <radialGradient id="cvGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.12" />
          <stop offset="55%" stopColor="#0a0f1c" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="200" cy="200" r="195" fill="url(#cvGlow)" />
      <g className="cv-spin-slow">
        <circle cx="200" cy="200" r="186" fill="none" stroke="#22d3ee" strokeOpacity="0.18" strokeWidth="1" strokeDasharray="2 11" />
        <circle cx="200" cy="200" r="168" fill="none" stroke="#22d3ee" strokeOpacity="0.08" strokeWidth="1" />
      </g>
      <g className="cv-spin-med">
        <circle cx="200" cy="200" r="138" fill="none" stroke="#f59e0b" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="34 18" />
        {markers.map((a) => {
          const rad = (a * Math.PI) / 180;
          return <circle key={a} cx={200 + 138 * Math.cos(rad)} cy={200 + 138 * Math.sin(rad)} r="2.5" fill="#fbbf24" />;
        })}
      </g>
      <g className="cv-spin-fast">
        <circle cx="200" cy="200" r="100" fill="none" stroke="#f59e0b" strokeOpacity="0.32" strokeWidth="1" strokeDasharray="11 8" />
      </g>
      <g className="cv-pulse">
        <circle cx="200" cy="200" r="58" fill="none" stroke="#f59e0b" strokeOpacity="0.55" strokeWidth="1" />
        <circle cx="200" cy="200" r="3" fill="#f59e0b" />
      </g>
      <g stroke="#f59e0b" strokeOpacity="0.25" strokeWidth="1">
        <line x1="200" y1="6" x2="200" y2="22" />
        <line x1="200" y1="378" x2="200" y2="394" />
        <line x1="6" y1="200" x2="22" y2="200" />
        <line x1="378" y1="200" x2="394" y2="200" />
      </g>
    </svg>
  );
}
