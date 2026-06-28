// Weapon-class glyph for missile depots / armory. Colour-coded by class so a
// player can read "long-range AA vs strike vs SEAD" at a glance — no photos.
const CLASS_META: Record<string, { color: string; label: string }> = {
  a2a_bvr:        { color: "#22d3ee", label: "BVR" },   // cyan  — beyond-visual-range AA
  a2a_wvr:        { color: "#f59e0b", label: "WVR" },   // amber — within-visual-range AA
  anti_radiation: { color: "#fb7185", label: "ARM" },   // rose  — SEAD
  land_attack:    { color: "#fb923c", label: "LAND" },  // orange — cruise / land-attack
  anti_ship:      { color: "#2dd4bf", label: "SHIP" },  // teal  — anti-ship
  glide_bomb:     { color: "#eab308", label: "BOMB" },  // yellow — glide bomb
};

export function missileClassMeta(weaponClass?: string) {
  return CLASS_META[weaponClass ?? ""] ?? { color: "#94a3b8", label: "" };
}

export interface MissileIconProps {
  weaponClass?: string;
  size?: number;
  className?: string;
}

export function MissileIcon({ weaponClass, size = 18, className }: MissileIconProps) {
  const { color } = missileClassMeta(weaponClass);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      style={{ filter: `drop-shadow(0 0 3px ${color}55)` }}
    >
      <g fill={color}>
        {/* nose cone + body (sleek vertical missile) */}
        <path d="M12 1.5 C 14.3 4.2, 14.8 7.5, 14.8 11 L 14.8 16 L 9.2 16 L 9.2 11 C 9.2 7.5, 9.7 4.2, 12 1.5 Z" />
        {/* swept tail fins */}
        <path d="M9.2 12.5 L 5.6 17.5 L 9.2 15.5 Z" />
        <path d="M14.8 12.5 L 18.4 17.5 L 14.8 15.5 Z" />
        {/* exhaust flame */}
        <path d="M10.4 16 L 12 21.5 L 13.6 16 Z" opacity="0.9" />
      </g>
    </svg>
  );
}
