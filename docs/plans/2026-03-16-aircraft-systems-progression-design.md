# Aircraft Subsystem Customization & Progression System — Design

**Date:** 2026-03-16
**Status:** Approved design, not yet implemented

---

## Problem

The app doesn't feel like a defense game. Aircraft are static stat cards (buy/sell). There's no sense of progress beyond accumulating money. Management is shallow — no maintenance, no crew-to-aircraft pairing, no subsystem control. R&D exists but does nothing. After 10 missions there's no reason to keep playing.

## Vision

Players should feel like they're running a real PMC with real fighter jets. They customize aircraft subsystems (radar, engines, ECM), maintain them between missions, assign pilots, and progress through a campaign arc that unlocks deeper content. The tycoon loop: fly missions → earn money → upgrade/repair equipment → tackle harder missions.

---

## Feature 1: Aircraft Subsystem Customization

### Slot System

Each aircraft has **6 subsystem slots**. Each slot holds a **module** that can be swapped:

| Slot | What it is | Examples | Combat effect |
|------|-----------|----------|---------------|
| **Radar** | Detection sensor | APG-68 (120km), APG-83 (150km), Zhuk-ME (130km) | Detection range, scan reveal speed, BVR lock quality |
| **Engine** | Powerplant | F110-GE-129 (TWR 1.1), AL-31F (TWR 1.05) | Fuel burn rate, max speed, climb rate, disengage chance |
| **ECM Suite** | Electronic warfare | ALQ-178 (rating 40), Khibiny (rating 60) | ECM charges, jamming effectiveness, enemy Pk reduction |
| **Countermeasures** | Chaff/flare dispensers | Standard (30 chaff/24 flare), Enhanced (60/48) | Flare uses, chaff effectiveness |
| **Mission Computer** | Avionics brain | Standard, AESA-integrated, Sensor-fused | Pk bonus, multi-target tracking, intel reveal speed |
| **Airframe** | Structural mods | Standard, Reinforced (+HP -maneuver), Lightweight (-HP +maneuver) | Damage tolerance, G-limit, payload capacity |

### Rules
- Each aircraft comes with **default modules** matching its current stats
- Modules have **compatibility lists** (F-16 can't use Su-35 radar)
- Swapping is instant and free (the module is already owned)
- Modules can be moved between aircraft (not duplicated)

### Module Sources
- **Marketplace**: Basic modules always available for purchase
- **R&D unlocks**: Advanced modules unlocked via tech tree research
- **Mission loot**: 10-20% chance of rare module drop on high-risk missions

### Data Model

```
SubsystemModule:
  id, name, slot_type (radar/engine/ecm/countermeasures/computer/airframe)
  tier (1-3), origin, description
  stats (JSON): {radar_range_km, ecm_rating, twr_modifier, flare_count, ...}
  cost, maintenance_cost_per_mission
  compatible_aircraft (JSON): [aircraft_id, ...]
  requires_research_id (nullable FK)

AircraftSubsystem:
  id, owned_aircraft_id (FK), slot_type, module_id (FK)
  condition_pct (0-100, degrades per mission)
```

### Hangar UI

Aircraft detail view shows 6 slots in a 3×2 grid. Each slot displays:
- Module name, key stat value, condition % bar
- Tap to open module swap drawer
- Swap drawer shows compatible owned modules + marketplace options

---

## Feature 2: Wear & Repair System

### Subsystem Degradation
After each battle, subsystems degrade:
- **Light mission**: 3-8% per subsystem
- **Standard mission**: 5-12% per subsystem
- **High-risk mission**: 8-18% per subsystem
- Subsystems used heavily degrade more (radar if lots of scanning, engines if lots of maneuvering)

### Degradation Effects
- **Radar at 60%**: Detection range reduced by 15%
- **Engine at 50%**: Fuel burn rate +20%, TWR reduced
- **ECM at 40%**: ECM charges reduced by 1, effectiveness -25%
- **Below 20%**: Subsystem may fail mid-mission (random chance)

### Repair
- **Per-subsystem repair**: Cost = (100 - condition) × module.maintenance_cost × 0.01
- **Repair All**: Sum of all subsystem repairs, 10% discount
- Repair is instant (no wait time — keep gameplay flowing)

### Monthly Costs
- Each aircraft has a hangar fee (already exists as maintenance_cost)
- Creates budget pressure: more aircraft = higher upkeep

---

## Feature 3: Progression System

### Layer 1: PMC Rank (long arc)

| Rank | Rep Threshold | Missions | Unlocks |
|------|--------------|----------|---------|
| **Startup** | 0-20 | 0 | Basic contracts, 2 aircraft slots, starter modules |
| **Licensed** | 20-40 | 10+ | Mid-tier contracts, 4 aircraft slots, weapon shop expands |
| **Established** | 40-60 | 25+ | High-risk contracts, naval missions, R&D tier 2 |
| **Elite** | 60-80 | 50+ | Black ops contracts, rare module marketplace, rival PMC events |
| **Legendary** | 80-100 | 100+ | Endgame contracts, unique aircraft variants, prestige rewards |

Rank displayed on Dashboard with progress bar to next tier.

### Layer 2: Campaign Chapters (medium arc)

Missions grouped into narrative chapters:
- **Chapter 1: "Sahara Crisis"** — 5-8 air combat missions, escalating difficulty
- **Chapter 2: "Pacific Tensions"** — Naval-focused, carrier operations
- **Chapter 3: "Arctic Shadow"** — Stealth-focused, rewards stealth modules
- Chapters unlock based on PMC rank
- Each chapter has briefing text, faction context, and a chapter completion reward

### Layer 3: Per-Mission Rewards (short arc)
- **Payout** (existing)
- **Reputation** (existing)
- **Module loot** (10-20% chance on high-risk, guaranteed on chapter completion)
- **Pilot XP** (contractors gain XP, level up for skill bonuses)
- **Subsystem wear** (creates repair demand)

---

## Feature 4: R&D Overhaul

Replace the current hardcoded stub with a real tech tree:

### Structure
- **3 tiers** gated by PMC rank (Startup → Established → Elite)
- Each research item unlocks a **specific module** for the marketplace
- Research costs **money + research points** (RP earned from missions)
- Research takes **in-game time** (hours, tracked by server)

### Tech Branches
- **Sensors**: Radar upgrades, IRST integration, sensor fusion computers
- **Propulsion**: Engine upgrades, fuel efficiency, thrust vectoring
- **Electronic Warfare**: Advanced ECM suites, next-gen countermeasures, ECCM
- **Structures**: Reinforced airframes, stealth coatings, lightweight composites
- **Weapons Integration**: Advanced mission computers, multi-target tracking

### Data Model
```
ResearchItem:
  id, name, description, branch, tier
  cost_money, cost_rp, duration_hours
  prerequisite_id (nullable FK — tech tree chain)
  unlocks_module_id (FK to SubsystemModule)

UserResearch:
  id, user_id, research_item_id
  status (available/in_progress/completed)
  started_at, completed_at
```

---

## Feature 5: Crew-to-Aircraft Assignment

### Pairing
- Each aircraft gets one **assigned pilot** (contractor)
- Pilot's skill level affects combat performance on that aircraft
- Pilot's fatigue accumulates per mission on that aircraft
- Unassigned aircraft can still fly (with "generic pilot" at skill 40)

### Pilot Leveling
- Contractors gain XP per mission (50-200 XP based on performance)
- Level thresholds: 0→100 XP (Lvl 1), 100→300 (Lvl 2), etc.
- Each level: +2 skill points (affects Pk, fuel efficiency, damage avoidance)

---

## Implementation Phases

### Phase 1: Subsystem Foundation (backend)
- New models: SubsystemModule, AircraftSubsystem
- Seed default modules from existing aircraft stats
- API: list modules, get aircraft subsystems, swap module
- Migration: populate subsystems for existing owned aircraft

### Phase 2: Hangar Overhaul (frontend)
- Aircraft detail view with 6-slot grid
- Module swap UI
- Real-time stat recalculation
- Module marketplace integration

### Phase 3: Wear & Repair
- Post-battle degradation logic in battle API
- Repair endpoints
- Repair UI in hangar
- Degradation effects on combat engine

### Phase 4: R&D Overhaul
- New models: ResearchItem, UserResearch
- Seed tech tree data
- Research API (start, check progress, complete)
- Redesign R&D frontend with real tech tree

### Phase 5: Progression System
- PMC rank model + rank-gated content
- Pilot XP system
- Rank UI on dashboard
- Content gating in contracts/marketplace

### Phase 6: Campaign Chapters
- Mission grouping model
- Chapter briefings and sequential unlock
- Chapter rewards
- Chapter select UI

Each phase is independently deployable.

---

## UX Design: "Classified Dossier" Aesthetic

### Design Philosophy

**The metaphor:** You're reading classified intelligence files on a secure terminal. Every screen is a dossier. Every aircraft is a file. Every mission is a briefing packet. Battles transition from dossier briefings into HUD combat via a static/interference animation.

### Color Palette

| Role | Color | Hex | Usage |
|------|-------|-----|-------|
| Base background | Near-black navy | `#0C0E12` | App background |
| Card/paper | Dark slate | `#151820` | Cards, drawers, modals |
| Primary accent | Amber/gold | `#D4A843` | Stamps, active states, folder tabs |
| Danger/enemy | Muted red | `#C4453C` | CLASSIFIED stamps, enemy, damage |
| Intel/data | Steel blue | `#5B8BA0` | Technical readouts, intel badges |
| Success | Olive green | `#5C8A4D` | Mission success, operational status |
| Text primary | Off-white | `#D8D4CC` | Warm, like aged paper under fluorescent |
| Text muted | Faded ink | `#6B6860` | Secondary text, labels |
| Borders | Structural | `#252830` | Card borders, dividers |

### Typography

| Role | Font | Style |
|------|------|-------|
| Screen headers | Barlow Condensed (or system condensed fallback) | Uppercase, letter-spacing 0.15em, bold |
| Section labels | Same condensed | Uppercase, smaller, tracked wide |
| Body text | Inter / system sans-serif | Regular weight, readable |
| Data/numbers | JetBrains Mono / Fira Code / monospace | All prices, stats, coordinates, IDs |
| Stamps/badges | Bold condensed uppercase | Border + background tint, rotated -2deg for stamps |

### Texture & Effects

- **Noise grain**: 2-3% opacity overlay on backgrounds — paper texture feel
- **Faint ruled lines**: On card backgrounds — like lined notebook paper
- **Redaction bars**: `████████` on locked/classified content — CSS background with repeating black blocks
- **Classification stamps**: "CONFIDENTIAL", "SECRET", "TOP SECRET" — rotated -3deg, semi-transparent, red/amber tint
- **Corner fold**: CSS triangle on card corners — like page fold
- **Static transition**: 0.5s glitch/interference animation between dossier and HUD views

### Screen Designs

#### Dashboard ("Command Briefing")

Daily intelligence briefing — one-page summary with classification stamp.

- **"CLASSIFIED" stamp** at top-right, rotated -3deg, red, 40% opacity
- **Date + clearance level** in monospace under header
- **3 stat cards** in a row: Treasury (monospace $), Standing (% bar), Tech Level (tier pips ▰▰▰▱▱)
- **PMC Rank** — prominent progress bar with rank name, rep fraction, "Next unlock" teaser
- **Active Deployments** — live ticker with pulsing status dots, aircraft + pilot names
- **Recent Intel** — mission results as bullet points, module loot highlighted
- **Redacted entries** — locked content shown as `████████` with rank requirement — motivates progression

#### Hangar ("Equipment Dossier")

Aircraft = file folders. Subsystems = technical specification sheets.

**Aircraft list:**
- Cards styled as file folders with amber tab at top
- Show: image, name, origin/gen/role, hull condition bar, assigned pilot, [OPEN FILE] button
- Red condition indicator if below 60%

**Aircraft detail (opened file):**
- Full-width aircraft photo header
- Identity block: name, designation, pilot assignment with [CHANGE] button
- **6 subsystem slots** in 2×3 grid (mobile) / 3×2 (desktop):
  - Each slot: labeled header (e.g., "─ RADAR ─"), module name, key stat, condition bar
  - [SWAP ⟳] button on each slot
  - Condition bar colors: green (>70%), amber (40-70%), red (<40%)
- **Performance summary** auto-calculated from modules: detection, ECM, fuel, flares, G-limit, payload
- **Action buttons**: [REPAIR ALL — $X] and [DEPLOY ▸]

**Module swap drawer (bottom sheet on mobile):**
- Shows currently installed module at top
- Available modules below with stat diff (▲ +30km / ▼ -5 ECM rating)
- "Currently on: [aircraft]" tag if module is installed elsewhere
- Locked modules shown with `████` redaction + "Requires: [research name]" + 🔒 icon

#### Contracts ("Mission Briefing Packets")

Each mission is a briefing packet — stamped with classification level.

- **Classification stamp** based on risk: Low="CONFIDENTIAL" (amber), Med="SECRET" (amber-red), High="TOP SECRET" (red)
- **Threat assessment box**: Enemy type, capability rating, expected resistance
- **Recommended loadout**: Hints at subsystems/weapons needed (helps new players)
- **Compensation block**: Payout, rep change, duration — monospace numbers
- **Locked missions**: Fully redacted cards with only rank requirement visible — `████████████`
- **Accept → Vehicle select → Briefing → Loadout → Launch** flow

#### R&D ("Technical Research Division")

Tech tree as vertical branch diagram.

- **Status icons**: ✓ complete, ◉ in progress, ○ available, 🔒 locked
- **Active research**: Progress bar with time remaining, creates anticipation
- **Branch lines**: Connecting parent→child research items
- **Locked items**: Redacted names/stats, rank requirement shown
- **Dual cost display**: RP + money for each item — creates resource tension

#### Personnel ("Personnel Dossiers")

Contractors as personnel files.

- Cards styled as dossier pages: photo placeholder, name in bold condensed
- Key data in monospace: skill level, XP/level, salary
- Fatigue status with colored indicator (green=rested, amber=tired, red=exhausted)
- Assignment line: "Assigned: F-16C" or "Unassigned" — links to hangar
- Expanded view: full skill breakdown, mission history, [REST] and [DISMISS] buttons

#### Battle Transition ("Briefing → Combat")

**Pre-battle briefing (dossier style):**
- Mission name, AO (area of operations), weather, ROE
- Your aircraft summary with subsystem status
- Enemy threat assessment (partially redacted based on intel gathered)
- Loadout configuration (existing loadout screen, restyled)
- [LAUNCH SORTIE ▸] button

**Transition animation:**
- 0.5s static/interference glitch effect
- Screen wipes from paper-warm tones to dark HUD blue-green
- HUD elements slide in (existing battle screen)

**Post-battle debrief (dossier style):**
- Back to paper aesthetic — typed field report
- "MISSION SUCCESS" stamp (olive) or "MISSION FAILED" stamp (red)
- Turn timeline as field notes
- **Subsystem wear report**: "Radar: 92% → 78%, Engine: 85% → 71%"
- **Module loot** (if any): "RECOVERED EQUIPMENT" section with item card
- [FILE REPORT] button → returns to operations

### Mobile-Specific Rules

| Rule | Spec |
|------|------|
| Min touch target | 44px × 44px for all interactive elements |
| Min font size | 12px body, 10px for labels/captions only |
| Card padding | 16px minimum |
| Bottom nav | 56px tall, 5 tabs with labels |
| Bottom sheet modals | Slide up from bottom, max 85vh, swipe-to-dismiss |
| Subsystem grid | 2 columns on mobile (<640px), 3 on tablet+ |
| Scroll behavior | Momentum scrolling, pull-to-refresh on lists |
| Safe areas | Respect notch + home indicator insets |
| Stamps/badges | Min 28px height, readable at arm's length |

### Navigation

5-tab bottom nav (mobile) / sidebar (desktop):
- **HQ** — Dashboard/Command Briefing
- **Hangar** — Equipment Dossier
- **Crew** — Personnel Dossiers
- **Ops** — Mission Briefing Packets
- **R&D** — Technical Research Division

Icons: Military-style, consistent weight. Active tab: amber accent + filled icon.

---

## Research Sources
- [War Thunder Mobile Aircraft Campaign Progression](https://wtmobile.com/news/aircraft-campaign-progression-system) — Tech tree + crew specialization pattern
- [Private Military Manager](https://store.steampowered.com/app/2564320/Private_Military_Manager_Tactical_Auto_Battler/) — PMC CEO loop: recruit, equip, develop
- [Adding Strategy to Tactics](https://www.gamedeveloper.com/design/adding-strategy-to-your-tactics) — Short arcs (missions) feeding long arcs (campaign) creates depth
- [Ace Combat Electronic Warfare](https://acecombat.fandom.com/wiki/Electronic_warfare) — ECM as felt gameplay mechanic, not just a stat
