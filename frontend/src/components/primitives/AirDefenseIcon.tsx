// Air-defence glyph: a coverage dome + an interceptor launching upward.
// Used for AD systems/batteries across the app (sky-cyan to read as "shield").
export interface AirDefenseIconProps {
  color?: string;
  size?: number;
  className?: string;
}

export function AirDefenseIcon({ color = "#38bdf8", size = 18, className }: AirDefenseIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      style={{ filter: `drop-shadow(0 0 3px ${color}55)` }}
    >
      {/* coverage dome */}
      <path d="M3 17 A 9 8 0 0 1 21 17" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
      {/* ground line */}
      <line x1="3.5" y1="17" x2="20.5" y2="17" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
      {/* interceptor launching up */}
      <path d="M12 16.5 L12 6 M8.6 9.4 L12 6 L15.4 9.4" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
