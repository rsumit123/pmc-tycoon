export interface GlossaryEntry {
  /** Canonical display term, e.g. "BVR (Beyond Visual Range)". */
  term: string;
  /** One-line plain-language definition. */
  short: string;
  /** Optional "why it matters" for the player. */
  why?: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  bvr: { term: "BVR (Beyond Visual Range)", short: "Long-range air combat — firing radar-guided missiles from tens of km away, before you can see the enemy.", why: "Whoever detects and shoots first usually wins. Good radar + AWACS gives you the BVR edge." },
  wvr: { term: "WVR (Within Visual Range)", short: "Close-in dogfighting with short-range missiles when jets merge within ~30 km." },
  roe: { term: "ROE (Rules of Engagement)", short: "How aggressively you let pilots shoot.", why: "“Weapons Free” fires earliest for the best hit chance; tighter rules trade hits for caution." },
  rcs: { term: "RCS (Radar Cross-Section)", short: "How big an aircraft looks on radar. Lower = harder to detect and hit." },
  vlo: { term: "VLO / Stealth", short: "Very Low Observable — stealth jets (e.g. AMCA, J-20) that radar struggles to see.", why: "Stealth aircraft are hard to kill; you need numbers or your own stealth to counter them." },
  lo: { term: "LO (Low Observable)", short: "Reduced-radar-signature aircraft — stealthier than normal but not full stealth." },
  awacs: { term: "AWACS", short: "A flying radar command plane (e.g. Netra) that extends your detection range.", why: "Adds detection reach and a small missile-accuracy bonus to the fight." },
  tanker: { term: "Tanker", short: "An aerial refuelling aircraft (IL-78) that extends how far your fighters can reach." },
  sead: { term: "SEAD", short: "Suppression of Enemy Air Defenses — strikes that hunt and kill enemy radars/SAMs." },
  nez: { term: "NEZ (No-Escape Zone)", short: "The range band inside which a missile is very hard to dodge — closer is deadlier." },
  foc: { term: "FOC (Full Operational Capability)", short: "The quarter when every aircraft in an order has finally been delivered." },
  first_delivery: { term: "First delivery", short: "The quarter the first units of an order start arriving (deliveries spread out until FOC)." },
  interceptor_stock: { term: "Interceptor stock", short: "How many missiles an air-defense battery has left to fire. Reload via Acquisitions." },
  missile_stock: { term: "Missile stock", short: "Air-to-air missiles stored at a base. Squadrons there draw from it in combat; buy more via Acquisitions." },
  readiness: { term: "Readiness", short: "A squadron's combat fitness (0–100%). Maintained by your O&M and Spares budget." },
  om: { term: "O&M (Operations & Maintenance)", short: "Budget that keeps squadrons flying and readiness up." },
  spares: { term: "Spares", short: "Budget for parts that raises the readiness ceiling of your fleet." },
  rd: { term: "R&D", short: "Multi-year programs that unlock new fighters, missiles, sensors and air-defense systems." },
  acquisition: { term: "Acquisition", short: "Buying aircraft, missiles or air-defense — delivered over several quarters." },
  vignette: { term: "Vignette", short: "A combat event that fires periodically. You commit a force and it resolves automatically." },
  ao: { term: "AO (Area of Operations)", short: "The region a vignette or strike takes place in." },
  posture: { term: "Posture", short: "A snapshot of your force readiness, defenses and threat level." },
  doctrine: { term: "Doctrine", short: "How an air force fights — its mix of aircraft, tactics and modernization." },
  generation: { term: "Generation (4 / 4.5 / 5th-gen)", short: "Aircraft era. Higher gen = better radar, weapons and (for 5th-gen) stealth.", why: "A generation gap can beat raw numbers in a fight." },
  multirole: { term: "Multirole", short: "A fighter that can do both air-to-air and ground strike." },
  air_superiority: { term: "Air superiority", short: "A fighter optimized for winning air-to-air combat." },
  isr: { term: "ISR", short: "Intelligence, Surveillance & Reconnaissance — drones that watch enemy bases." },
  ucav: { term: "UCAV", short: "An armed combat drone (e.g. Ghatak)." },
  arm: { term: "ARM (Anti-Radiation Missile)", short: "A missile that homes on enemy radar emissions — used for SEAD." },
  anti_ship: { term: "Anti-ship missile", short: "A missile designed to strike warships (e.g. BrahMos)." },
  sortie: { term: "Sortie", short: "One operational flight by one aircraft." },
  ace: { term: "Ace", short: "A standout squadron that has racked up kills and experience." },
  xp: { term: "XP (Experience)", short: "Combat experience a squadron earns; veterans shoot a little better." },
  squadron: { term: "Squadron", short: "A unit of aircraft of one type, based at one airbase." },
  airframe: { term: "Airframe", short: "A single aircraft. A squadron is made of several airframes." },
  grant: { term: "Quarterly grant", short: "The budget you receive each quarter to spend across R&D, acquisitions and upkeep." },
  treasury: { term: "Treasury", short: "Your accumulated funds, in crore (cr)." },
  runway_class: { term: "Runway class", short: "How capable a base's runway is — limits which aircraft can be based there." },
  ad_battery: { term: "AD battery", short: "A surface-to-air missile site (e.g. S-400) that shoots down aircraft over a base." },
  coverage: { term: "Coverage", short: "The radius around an air-defense battery within which it can engage aircraft." },
  blowback: { term: "Blowback", short: "Diplomatic fallout from an offensive strike — souring relations with a rival." },
  intel_quality: { term: "Intel quality", short: "How reliable your picture of the enemy is — low quality means fuzzy force estimates." },
  confidence: { term: "Confidence", short: "How sure an intelligence report is, as a percentage." },
};

export function lookupTerm(key: string): GlossaryEntry | undefined {
  return GLOSSARY[key.trim().toLowerCase()];
}
