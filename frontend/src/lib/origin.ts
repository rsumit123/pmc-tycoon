// Source-country flag helpers for Acquisitions cards.
// Platforms already carry `origin` (IND/FR/RU/...). Missiles + AD systems
// don't have an origin field on the backend, so we hardcode here — they're
// gameplay-critical and stable.

export const ORIGIN_FLAG: Record<string, string> = {
  IND: "🇮🇳",
  FR: "🇫🇷",
  RU: "🇷🇺",
  US: "🇺🇸",
  SE: "🇸🇪",
  IL: "🇮🇱",
  UK: "🇬🇧",
  EU: "🇪🇺",
  CN: "🇨🇳",
  PAK: "🇵🇰",
};

export function flagFor(origin: string | undefined | null): string {
  if (!origin) return "";
  return ORIGIN_FLAG[origin] ?? "";
}

// weapon_id → origin code. Anything in our catalog not listed here falls back
// to no flag (harmless).
export const WEAPON_ORIGIN: Record<string, string> = {
  // India (DRDO)
  astra_mk1: "IND",
  astra_mk2: "IND",
  astra_mk3: "IND",
  rudram_2: "IND",
  rudram_3: "IND",
  brahmos_ng: "IND",
  air_brahmos2: "IND",
  ngarm: "IND",
  saaw: "IND",
  // Europe (MBDA)
  meteor: "EU",
  // France (MBDA/Matra)
  mica_ir: "FR",
  // Russia
  r77: "RU",
  r73: "RU",
  // USA
  aim120d: "US",
  aim9x: "US",
  // China (adversary-only; listed for completeness)
  pl15: "CN",
  pl17: "CN",
  pl10: "CN",
  yj21: "CN",
  cj20: "CN",
};

// AD system id → origin code.
export const AD_SYSTEM_ORIGIN: Record<string, string> = {
  s400: "RU",
  // MR-SAM is a joint IL + IND program — use IL as the primary source.
  mrsam_air: "IL",
  long_range_sam: "IND",
  project_kusha: "IND",
  akash_ng: "IND",
  qrsam: "IND",
  vshorads: "IND",
};
