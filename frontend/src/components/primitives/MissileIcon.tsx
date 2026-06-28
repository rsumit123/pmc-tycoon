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
        {/* body */}
        <rect x="5" y="10" width="11" height="4" rx="2" />
        {/* nose cone (points right) */}
        <path d="M16 10 L21 12 L16 14 Z" />
        {/* tail fins */}
        <path d="M5 9.5 L1.5 7 L5 11 Z" />
        <path d="M5 14.5 L1.5 17 L5 13 Z" />
      </g>
    </svg>
  );
}
