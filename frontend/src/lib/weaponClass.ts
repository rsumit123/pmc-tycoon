import type { WeaponClass } from "./types";

export const WEAPON_CLASS_META: Record<
  WeaponClass,
  { label: string; role: "a2a" | "strike"; hint: string; badgeClass: string }
> = {
  a2a_bvr: {
    label: "BVR Air-to-Air",
    role: "a2a",
    hint: "Beyond Visual Range air-to-air missile — used in combat vignettes",
    badgeClass: "bg-emerald-900/60 text-emerald-200 border-emerald-700",
  },
  a2a_wvr: {
    label: "WVR Air-to-Air",
    role: "a2a",
    hint: "Within Visual Range dogfight missile — used in merge phase",
    badgeClass: "bg-emerald-900/60 text-emerald-200 border-emerald-700",
  },
  anti_ship: {
    label: "Anti-Ship",
    role: "strike",
    hint: "Supersonic / hypersonic anti-ship cruise missile — NOT an air-to-air weapon",
    badgeClass: "bg-sky-900/60 text-sky-200 border-sky-700",
  },
  land_attack: {
    label: "Land-Attack Cruise",
    role: "strike",
    hint: "Long-range land-attack cruise missile — strike role only",
    badgeClass: "bg-indigo-900/60 text-indigo-200 border-indigo-700",
  },
  anti_radiation: {
    label: "Anti-Radiation",
    role: "strike",
    hint: "Suppresses enemy radar / SAM emitters — SEAD role",
    badgeClass: "bg-rose-900/60 text-rose-200 border-rose-700",
  },
  glide_bomb: {
    label: "Glide Bomb",
    role: "strike",
    hint: "Stand-off precision strike against ground targets",
    badgeClass: "bg-amber-900/60 text-amber-200 border-amber-700",
  },
};
