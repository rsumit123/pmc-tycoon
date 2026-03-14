# PMC Tycoon — UX Overhaul Design

## Problem

The battle system mechanics work (Pk formulas, phase logic, narrative) but the player experience is flat:
1. No images of aircraft or missiles — everything is text
2. No animations during battle — tap a choice, read text result
3. Decision impact unclear — player doesn't see what their choice changed
4. Loadout screen missing fuel selection
5. No cockpit/tactical immersion — feels like reading a report, not fighting

## Solution

Transform the battle UI into a **fighter HUD experience** with:
- Real aircraft/missile photos in loadout
- SVG HUD-style tactical view during battle (green-on-dark)
- Running combat log showing decision impacts explicitly
- CSS animations for missile launches, hits, radar sweeps
- Fuel loadout with weight tradeoff
- Naval battles use CIC/tactical radar vibe (different from air HUD)

---

## Image Strategy

**Loadout / Hangar screens** — Real photographs:
- Add `image_url` field to Aircraft, Weapon, Ship models
- Populate with public domain / CC-licensed photo URLs
- Displayed as card headers in loadout and hangar

**Battle screens** — SVG HUD elements:
- Aircraft shown as green wireframe silhouettes on dark background
- Missile trails as animated SVG paths
- Target brackets, range indicators, radar scope — all SVG/CSS
- No photos during battle (breaks the HUD immersion)

---

## Battle Screen Layout (Mobile-First)

### Air Combat HUD

```
┌──────────────────────────────────┐
│ ┌─SPD──┐                ┌─ALT──┐│
│ │M 1.4 │                │25000 ││
│ │M 1.2 │   ┌──────┐     │20000 ││
│ │M 1.0◄│   │ ◇TGT │     │15000 ││
│ │M 0.8 │   │ 120km│     │►10000││
│ └──────┘   └──────┘     └──────┘│
│                                  │
│  ◈────────── 120km ──────────◇  │
│ YOU                       ENEMY  │
│ Rafale                    F-16   │
│                                  │
│ ┌─WEAPONS────────────────────┐  │
│ │ MICA▪▪▪▪░░  FUEL████████░░│  │
│ └────────────────────────────┘  │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ [DET] RBE2 locked at 178km     │ ← Combat log
│ [BVR] MICA fired — Pk 95%      │   (scrolling)
│ [HIT] Target destroyed          │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ ┌────────┐┌────────┐┌────────┐ │
│ │ 🚀     ││ 🎯     ││ 🛡     │ │ ← Choices
│ │ FIRE   ││ CLOSE  ││ HOLD   │ │
│ │ RMAX   ││ TO RNE ││ DEF    │ │
│ │Low Risk││Hi Risk ││No Shot │ │
│ └────────┘└────────┘└────────┘ │
└──────────────────────────────────┘
```

### Naval CIC Display

```
┌──────────────────────────────────┐
│      COMBAT INFORMATION CENTER   │
│  ┌─────────────────────────┐    │
│  │     ·  ·  · 300km ·     │    │
│  │   ·    ╭─╮200km   ·    │    │
│  │ ·  ◈───┤■├───◇100km ·  │    │
│  │   ·    ╰─╯         ·    │    │
│  │     ·  ·  ·  ·  ·  ·    │    │
│  └─────────────────────────┘    │
│  BRG: 045°  RNG: 180km         │
│  HOSTILE: Type 052D Kunming     │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ [SAL] 16× BrahMos fired        │
│ [DEF] Enemy Barak-8: 4 kills   │
│ [HIT] 3 leakers — 45% damage   │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│ ┌────────┐┌────────┐┌────────┐ │
│ │FULL    ││HALF    ││SEA     │ │
│ │SALVO   ││SALVO   ││SKIM    │ │
│ └────────┘└────────┘└────────┘ │
└──────────────────────────────────┘
```

---

## Combat Log Specification

The combat log is a scrolling monospace panel that makes decision impact crystal clear:

### Log Entry Types

| Prefix | Color | Example |
|--------|-------|---------|
| `[DET]` | Cyan | `RBE2 AESA locked target at 178km — FIRST LOOK` |
| `[BVR]` | Amber | `MICA EM fired at 33km — Pk 95%` |
| `[HIT]` | Green | `TARGET HIT — 45% damage dealt` |
| `[MISS]` | Red | `Missile defeated by chaff — target evades` |
| `[WARN]` | Red flash | `INCOMING: AIM-120C at 80km!` |
| `[CM]` | Cyan | `Notch maneuver: Pk reduced 62% → 12% (OPTIMAL)` |
| `[DMG]` | Red | `Hit taken — hull integrity 65%` |
| `[FUEL]` | Amber | `Fuel: 82% → 74% (-8% this phase)` |
| `[IMPACT]` | Gold | `Your choice: +58km detection edge (OPTIMAL)` |

### Decision Impact Format

After every phase, the log shows an `[IMPACT]` line:
```
[IMPACT] Aggressive Scan → detected enemy 58km before they saw you (GOOD)
[IMPACT] Close to Rne → Pk boosted from 38% to 95% (OPTIMAL)
[IMPACT] Notch & Beam → incoming Pk dropped 62% → 12% (OPTIMAL for radar missile)
[IMPACT] RTB with 0% damage → missed chance to finish enemy (POOR — should have pressed)
```

---

## Loadout Screen Improvements

### Fuel Selection
- Add a **fuel slider** below the weapon list
- Range: 50% to 100% of internal fuel capacity
- Less fuel = lighter = better TWR and maneuverability
- More fuel = longer combat endurance
- Show tradeoff in real-time: "Fuel 70% → TWR +8% but -2 combat phases"

### Visual Improvements
- Aircraft photo as full-width header image (with dark gradient overlay)
- Each weapon card shows a small photo/icon of the missile
- Payload bar becomes a stacked bar: [MISSILES █████|FUEL ████░░░]
- Add "vs" card showing enemy aircraft photo + key stats

### Image Sources (DB fields)
Add to Aircraft model: `image_url` (nullable String)
Add to Weapon model: `image_url` (nullable String)
Add to Ship model: `image_url` (nullable String)

Populate with public domain photo URLs from Wikimedia Commons.

---

## CSS Animations

### HUD Animations (battle screen)

| Animation | Trigger | Implementation |
|-----------|---------|----------------|
| Radar sweep | Continuous | CSS conic-gradient rotation (3s loop) — already built but needs HUD styling |
| Missile launch | Player fires BVR/IR | SVG line animates left→right with glow trail. 1.5s duration. |
| Missile incoming | Enemy fires | SVG line animates right→left with red glow. 1s duration. |
| Target hit | Missile connects | Screen shake (CSS transform wobble 0.3s) + green flash overlay |
| Target miss | Missile misses | "MISS" text appears in HUD font, fades out 0.5s |
| Damage taken | Player hit | Red vignette flash + screen shake + hull bar drops with flash |
| Lock acquired | Detection phase | Target bracket appears with lock-on animation (scale 1.5→1.0 + beep visual) |
| Range closing | Each phase | Distance number counts down smoothly (CSS counter) |
| Choice selected | Player taps | Card pulses green, slides up into the HUD area, fades |
| Fuel burn | Each phase | Fuel bar decreases with subtle amber pulse |

### Screen Shake (CSS)
```css
@keyframes screenShake {
  0%, 100% { transform: translate(0); }
  10% { transform: translate(-4px, 2px); }
  30% { transform: translate(4px, -2px); }
  50% { transform: translate(-2px, 4px); }
  70% { transform: translate(2px, -4px); }
}
```

### HUD Text Style
```css
.hud-text {
  font-family: 'Courier New', monospace;
  color: #22c55e; /* emerald-500 */
  text-shadow: 0 0 8px rgba(34, 197, 94, 0.5);
  letter-spacing: 0.05em;
}
```

---

## Implementation Plan

### Step 1: Database — Add image URLs + fuel field
- Add `image_url` to Aircraft, Weapon, Ship models
- Add `fuel_capacity_pct` to battle engine loadout
- Populate image URLs in seed data (Wikimedia Commons URLs)
- Backend: include `image_url` in all GET responses

### Step 2: Loadout Screen Redesign
- Aircraft photo header with gradient overlay
- Weapon cards with missile images
- Fuel slider (50-100%) with TWR impact display
- "vs" opponent preview card
- Submit sends fuel_pct along with weapons

### Step 3: Battle HUD — Air Combat
- Replace current BattleScreen with HUD layout
- Build SVG components: speed tape, altitude ladder, target bracket, radar mini-scope
- Wire up to battle state (range, speed, altitude update per phase)
- Green monospace HUD font throughout
- Dark background with subtle grid pattern

### Step 4: Combat Log Component
- Scrolling log panel with auto-scroll
- Color-coded entries by type
- [IMPACT] lines after each phase showing decision quality
- Monospace font matching HUD aesthetic

### Step 5: Animations
- Missile launch/incoming trail animations (SVG)
- Hit/miss flash + screen shake (CSS)
- Lock-on bracket animation
- Range countdown animation
- Fuel burn pulse
- Choice card slide-up animation

### Step 6: Naval CIC Screen
- Different aesthetic from air HUD: blue-tinted radar display
- Concentric range rings with ship icons
- Salvo tracking (missile count going through defense layers)
- Same combat log + choice card pattern

### Step 7: Result & Decision Clarity
- After each phase: HUD briefly highlights what changed
- Combat log [IMPACT] line with explicit before→after
- Phase transition shows "PHASE 3 → 4" with brief summary
- After-action report updated with HUD-style formatting
