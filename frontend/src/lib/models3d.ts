/** 3D mini models available for the Living Airbase map layer.
 * Files live in frontend/public/models3d/<id>.glb (built by scripts/build_mini_models.sh). */

export const MINI_MODELS = new Set([
  "amca_mk1", "rafale_f4", "su30_mki", "tejas_mk1a", "mig29_upg", "mirage2000",
  "jaguar_darin3", "mig21_bison", "netra_aewc", "il78_tanker", "ghatak_ucav",
  "mq9b_seaguardian",
]);

/** Platform variants that reuse a sibling's model (mirrors assets3d/manifest.json). */
export const MODEL_ALIASES: Record<string, string> = {
  rafale_f5: "rafale_f4",
  tejas_mk1: "tejas_mk1a",
  tejas_mk2: "tejas_mk1a",
  amca_mk2: "amca_mk1",
};

/** Model id to display for a platform, or null when we have no mini for it. */
export function miniModelFor(platformId: string): string | null {
  if (MINI_MODELS.has(platformId)) return platformId;
  const alias = MODEL_ALIASES[platformId];
  return alias && MINI_MODELS.has(alias) ? alias : null;
}
