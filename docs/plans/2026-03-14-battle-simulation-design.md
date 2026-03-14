# PMC Tycoon — Realistic Battle Simulation Design

## Problem

The current game has a shallow combat system — missions are resolved with a single dice roll based on generic "unit strength" numbers. There's no real military hardware, no tactical decisions, and no sense of *why* one side won. The game should feel like you're commanding real military engagements with real platforms (Rafale vs F-16, INS Chennai vs Type 052D) where actual specs drive outcomes and player tactics matter.

## Vision

**"The ultimate military what-if machine with a PMC tycoon wrapper."**

Players manage a PMC (existing tycoon layer), but when they deploy on missions, combat is a **6-phase tactical battle simulation** with:
- Real aircraft and ships with authentic specs
- Weapon systems as first-class entities (Astra Mk-2, AIM-120C, BrahMos, Barak-8)
- Player tactical decisions at each phase that swing outcomes ±55-65%
- Visual tactical display with CSS/SVG animations
- Detailed after-action reports showing exactly why things happened

## Domains at Launch

1. **Air-to-Air Combat** — Dogfights and BVR engagements
2. **Naval Surface Warfare** — Ship-vs-ship missile exchanges

## Architecture Overview

### The Tycoon + Battle Loop

```
PMC Management (existing)
  │
  ├─ Earn credits from missions
  ├─ Buy aircraft / ships (from real hardware catalog)
  ├─ Hire & manage crew
  ├─ Research upgrades
  │
  └─ Accept Mission Contract
       │
       ├─ Pre-Battle: Choose loadout (weapons, fuel, ECM)
       │
       ├─ BATTLE (6 phases, player decisions each phase)
       │   ├─ Phase 1: Loadout configuration
       │   ├─ Phase 2: Detection
       │   ├─ Phase 3: BVR / Missile Salvo
       │   ├─ Phase 4: Countermeasures / Defense
       │   ├─ Phase 5: Close-In / WVR / Counter-salvo
       │   └─ Phase 6: Damage & Disengage
       │
       └─ After-Action Report
            ├─ Phase-by-phase breakdown
            ├─ What-if analysis (optimal vs actual play)
            └─ Rewards / unit damage / crew fatigue
```

## Battle Phases

### Air Combat (6 phases)

| # | Phase | Player Decision | What Specs Matter |
|---|-------|-----------------|-------------------|
| 1 | **Loadout** | Pick weapon stations: BVR missiles, IR missiles, gun, ECM pod, fuel tanks. Constrained by max_payload_kg and hardpoints. | max_payload_kg, hardpoints, compatible_weapons, empty_weight_kg, max_takeoff_weight_kg |
| 2 | **Detection** | Aggressive scan / Passive IRST / Activate ECM early | radar_range_km, rcs_m2, irst, ecm_rating |
| 3 | **BVR Engagement** | Fire at Rmax / Close to Rne / Hold and maneuver | missile max_range, no_escape_range, base_pk, speed_mach |
| 4 | **Countermeasures** | Chaff + break / Notch (beam) / Go low / ECM + towed decoy | countermeasures, ecm_rating, max_g_load, wing_loading |
| 5 | **Close-In (WVR)** | IR missile / Guns / Disengage | instantaneous_turn_rate, thrust_to_weight, IR missile specs |
| 6 | **Damage & Disengage** | Press attack / RTB / Call reinforcements | remaining weapons, fuel, damage state |

### Naval Combat (6 phases)

| # | Phase | Player Decision | What Specs Matter |
|---|-------|-----------------|-------------------|
| 1 | **Fleet Composition** | Pick primary combatant + escorts, helicopter screen | ship displacement, weapon systems, sensor suite |
| 2 | **Detection** | Radar search / Helicopter recon / Passive sonar | radar_range_km, sonar, helicopter type |
| 3 | **Missile Salvo** | Choose missile type, salvo size, attack profile (sea-skim vs high-dive) | anti_ship_missiles (count, range, speed), guidance type |
| 4 | **Enemy Defense** | Observe enemy layered defense intercepting your salvo | enemy SAM specs, CIWS specs, ECM |
| 5 | **Counter-Salvo** | Defend: SAM allocation / CIWS activation / ECM + decoys | sam_systems, ciws, ecm_suite, decoys |
| 6 | **Damage Assessment** | Continue / Withdraw / Pursue | compartments (damage resilience), remaining weapons |

## Data Model

### Aircraft
```
Aircraft {
  // Identity
  name: string              // "Dassault Rafale"
  origin: string            // "France"
  role: string              // "multirole" | "air_superiority" | "interceptor" | "strike"
  generation: string        // "4.5"
  image_silhouette: string  // SVG path for tactical display

  // Performance
  max_speed_mach: float           // 1.8
  max_speed_loaded_mach: float    // 1.4 (with full combat loadout)
  combat_radius_km: int           // 1850
  service_ceiling_ft: int         // 50000

  // Maneuverability
  max_g_load: float                    // 9.0
  thrust_to_weight_clean: float        // 1.13
  wing_loading_kg_m2: int              // 306
  instantaneous_turn_rate_deg_s: int   // 28
  sustained_turn_rate_deg_s: int       // 22

  // Payload & Fuel
  empty_weight_kg: int         // 10300
  max_takeoff_weight_kg: int   // 24500
  internal_fuel_kg: int        // 4700
  max_payload_kg: int          // 9500
  hardpoints: int              // 14
  compatible_weapons: [int]    // FK to weapon IDs

  // Sensors
  radar_type: string        // "RBE2 AESA"
  radar_range_km: int       // 200
  rcs_m2: float             // 1.0
  irst: bool                // true

  // Electronic Warfare
  ecm_suite: string         // "SPECTRA"
  ecm_rating: int           // 0-100 (85)
  chaff_count: int          // 112
  flare_count: int          // 32
  towed_decoy: bool         // true

  // Game meta
  unlock_cost: int          // credits to purchase
  maintenance_cost: int     // credits per day
}
```

### Weapon
```
Weapon {
  // Identity
  name: string              // "Astra Mk-2"
  origin: string            // "India"
  type: enum                // BVR_AAM | IR_AAM | ASM | SAM | CIWS | GUN
  weight_kg: int            // 154

  // Kinematics
  max_range_km: int         // 160
  no_escape_range_km: int   // 60
  min_range_km: int         // 5
  speed_mach: float         // 4.5

  // Guidance
  guidance: string          // "inertial + active_radar" | "IR" | "semi_active_radar" | "anti_radiation"
  seeker_generation: int    // 1-5 (higher = harder to jam)

  // Lethality
  base_pk: float            // 0.75 (probability of kill at optimal conditions)
  warhead_kg: int           // 15

  // Countermeasure resistance
  eccm_rating: int          // 0-100 (resistance to ECM/chaff)
  maneuverability_g: int    // 40 (terminal maneuver G capability)

  // Game meta
  cost_per_unit: int        // credits
}
```

### Ship
```
Ship {
  // Identity
  name: string              // "INS Chennai"
  class_name: string        // "Kolkata"
  origin: string            // "India"
  ship_type: enum           // destroyer | frigate | corvette | cruiser | carrier
  image_silhouette: string  // SVG path

  // Specs
  displacement_tons: int    // 7500
  max_speed_knots: int      // 30
  crew: int                 // 300

  // Sensors
  radar_type: string        // "MF-STAR AESA"
  radar_range_km: int       // 250
  sonar: string             // "HUMSA-NG"
  helicopter: string        // "Sea King Mk42B" (nullable)

  // Weapons (each is {weapon_id, count})
  anti_ship_missiles: [{weapon_id, count}]   // [{brahmos, 16}]
  sam_systems: [{weapon_id, count}]          // [{barak_8, 32}]
  ciws: [{weapon_id, count}]                 // [{ak_630, 2}]
  torpedoes: [{weapon_id, count}]            // [{set_65e, 4}]
  gun: string                                // "OTO Melara 76mm"

  // Defense
  ecm_suite: string         // "Ajanta Mk2"
  ecm_rating: int           // 0-100
  decoys: string            // "Kavach"
  compartments: int         // 15 (damage resilience)

  // Game meta
  unlock_cost: int
  maintenance_cost: int
}
```

## Probability Engine

### Detection
```python
your_detection_range = radar_range * (enemy_rcs / 5.0) ** 0.25
enemy_detection_range = enemy_radar_range * (your_rcs / 5.0) ** 0.25
detection_advantage_km = your_detection_range - enemy_detection_range
```

### Missile Kill Probability
```python
# Range factor: 1.0 at Rne, degrades toward Rmax
range_factor = 1.0 - ((launch_range - rne) / (rmax - rne)) ** 1.5

# ECM factor: target's ECM vs missile's ECCM
ecm_factor = clamp(1.0 - (target_ecm - missile_eccm) / 150, 0.3, 1.0)

# Maneuver factor: can the target outrun the missile?
maneuver_factor = clamp(missile_g / (target_g * 2.5), 0.4, 1.0)

# Payload factor: heavier aircraft evade worse
current_twr = thrust / (empty_weight + current_payload + fuel)
clean_twr = thrust / empty_weight
payload_factor = current_twr / clean_twr  # < 1.0 when loaded

# Player choice modifier: ±30-40%
player_modifier = get_choice_effectiveness(choice, situation)

# Final Pk
pk = base_pk * range_factor * ecm_factor * maneuver_factor * payload_factor * player_modifier
pk = clamp(pk, 0.02, 0.95)  # always some chance
```

### Player Choice Effectiveness (situational)

Each choice has a lookup table based on the combat situation. The "right answer" depends on:
- Missile guidance type (active radar, semi-active, IR)
- Approach angle (head-on, beam, tail)
- Altitude band (high, medium, low)
- Speed regime (subsonic, transonic, supersonic)

Example: "Notch and beam" is optimal vs active radar head-on at high altitude (+40% defense), but terrible vs IR missile from behind (-15%).

**Total swing: ~55-65% between best and worst play across a full battle.**

### Naval Salvo Model
```python
# Salvo effectiveness
missiles_launched = chosen_salvo_size
leakers = missiles_launched

# Layer 1: Long-range SAM
for sam in enemy_sam_systems:
    intercepts = sam.count * sam_pk * player_defense_modifier
    leakers = max(0, leakers - intercepts)

# Layer 2: Point defense / ESSM
for pd in enemy_point_defense:
    intercepts = pd.count * pd_pk
    leakers = max(0, leakers - intercepts)

# Layer 3: CIWS
for ciws in enemy_ciws:
    intercepts = ciws.count * ciws_pk  # typically 0.3-0.5
    leakers = max(0, leakers - intercepts)

# Damage
hits = leakers  # each leaker that hits
damage_per_hit = missile_warhead_kg / (ship_displacement_tons * 0.01)
total_damage = hits * damage_per_hit * (1 + attack_profile_bonus)
```

## Battle UI Design

### Screen Flow
```
Mission Accept → Loadout Screen → Battle (6 phase screens) → After-Action Report
```

### Phase Screen Layout (mobile)
- **Top 60%**: Tactical view (CSS/SVG animated)
  - Aircraft/ship silhouette icons (top-down SVGs)
  - Animated radar sweep (CSS conic-gradient)
  - Range indicator between combatants
  - Missile trail animations (SVG dashed line + glow)
  - Engagement envelope arcs (Rmax dashed, Rne solid)
  - Ammo pips + fuel bar
- **Situation ticker**: 1-line scrolling context
- **Bottom 40%**: Choice cards (3 large tap targets with icon + label + risk indicator)

### Result Screen Layout
- Missile trail animation plays out
- Big bold Pk% and HIT/MISS result with screen flash
- "Why?" expandable section with factor pills (colored badges)
- 1-2 line narrative explaining what happened physically
- "Next Phase →" CTA

### Visual Elements (all CSS/SVG)
| Element | Tech | Purpose |
|---------|------|---------|
| Radar sweep | CSS conic-gradient + rotation animation | Tension / atmosphere |
| Missile trail | SVG animated dashed line with glow filter | Action payoff |
| Aircraft silhouettes | Inline SVG (top-down outline) | Platform recognition |
| Ship silhouettes | Inline SVG with damage zones | Naval feedback |
| Engagement envelope | SVG arc (Rmax dashed, Rne solid) | Tactical awareness |
| Defense rings (naval) | Concentric SVG circles | Layered defense visual |
| Factor pills | Colored badges (✅ ⚠️ ❌) | Quick factor scanning |
| Dice roll | CSS counter animation | Drama moment |
| Hit/Miss flash | Full-width CSS overlay animation | Visceral feedback |

### After-Action Report
- Full battle timeline with all 6 phases
- Per-phase: your choice → outcome → factor breakdown → narrative
- "What-if" section: shows optimal play vs your choices and how outcome would differ
- Hardware damage report (unit condition changes)
- Crew fatigue impact
- Rewards: credits, reputation

## Initial Hardware Roster

### Aircraft (launch set)
| Aircraft | Origin | Gen | Role | Radar Range | RCS | Notable |
|----------|--------|-----|------|-------------|-----|---------|
| Dassault Rafale | France | 4.5 | Multi | 200km | 1.0 | SPECTRA ECM, Meteor missile |
| F-16C Block 52 | USA | 4 | Multi | 160km | 5.0 | Affordable, proven |
| Su-30MKI | Russia/India | 4.5 | Superiority | 200km | 10.0 | TVC, huge payload |
| F-15E Strike Eagle | USA | 4 | Superiority | 180km | 10.0 | High TWR, speed |
| JF-17 Thunder | Pakistan/China | 4 | Light | 130km | 3.0 | Budget fighter |
| Tejas Mk2 | India | 4.5 | Light | 150km | 1.5 | AESA, good ECM |
| Mirage 2000-5 | France | 4 | Multi | 150km | 2.0 | Agile, proven |
| Eurofighter Typhoon | Europe | 4.5 | Superiority | 200km | 0.5 | Low RCS, supercruise |

### Ships (launch set)
| Ship | Class | Origin | Displacement | ASM | SAM | Notable |
|------|-------|--------|-------------|-----|-----|---------|
| INS Chennai | Kolkata | India | 7500t | 16x BrahMos | 32x Barak-8 | MF-STAR AESA |
| INS Visakhapatnam | Visakhapatnam | India | 7400t | 8x BrahMos | 32x Barak-8 | Upgraded sensors |
| Type 052D | Luyang III | China | 7500t | 8x YJ-18 | 64x HHQ-9 | Large VLS |
| Arleigh Burke IIA | Burke | USA | 9200t | 8x Harpoon | 96x SM-2/SM-6 | Aegis, massive SAM |
| Admiral Gorshkov | Gorshkov | Russia | 5400t | 16x Kalibr | 32x Redut | Small but lethal |

### Weapons (launch set)
| Weapon | Type | Origin | Range | Speed | Pk | Notable |
|--------|------|--------|-------|-------|-----|---------|
| Astra Mk-1 | BVR AAM | India | 110km | M4 | 0.70 | Active radar |
| Astra Mk-2 | BVR AAM | India | 160km | M4.5 | 0.75 | Extended range |
| AIM-120C AMRAAM | BVR AAM | USA | 120km | M4 | 0.80 | Gold standard |
| MICA EM | BVR AAM | France | 80km | M4 | 0.85 | Highly agile |
| Meteor | BVR AAM | Europe | 200km | M4+ | 0.90 | Ramjet, long NEZ |
| R-77 | BVR AAM | Russia | 110km | M4 | 0.70 | Active radar |
| Python-5 | IR AAM | Israel | 20km | M4 | 0.90 | WVR, all-aspect |
| AIM-9X | IR AAM | USA | 18km | M3 | 0.88 | HOBS capability |
| BrahMos | ASM | India/Russia | 290km | M2.8 | 0.85 | Supersonic, sea-skim |
| Harpoon | ASM | USA | 130km | M0.85 | 0.70 | Subsonic, proven |
| Barak-8 | SAM | India/Israel | 100km | M2 | 0.80 | Long-range defense |
| SM-2 | SAM | USA | 170km | M3.5 | 0.85 | Aegis integrated |
| AK-630 | CIWS | Russia | 4km | — | 0.40 | Gatling gun |
| Phalanx | CIWS | USA | 3.5km | — | 0.50 | Radar-guided |

## Implementation Plan

### Phase 1: Data Foundation (Backend)
- New database tables: Aircraft, Weapon, Ship (with all specs above)
- Seed data script with the launch roster
- New API endpoints: GET /aircraft, GET /weapons, GET /ships

### Phase 2: Battle Engine (Backend)
- Phase-based combat engine replacing current simulation.py
- Detection, BVR, countermeasures, WVR, damage models
- Situational choice effectiveness lookup tables
- Narrative generation per phase
- New API: POST /battle/start, POST /battle/phase-choice, GET /battle/{id}/state

### Phase 3: Loadout & Fleet Composition UI (Frontend)
- Loadout screen: drag weapons to hardpoints, see weight/payload bar
- Fleet composition screen: pick ships and escorts
- Weight/performance tradeoff visualized in real-time

### Phase 4: Battle UI (Frontend)
- Tactical view component (SVG/CSS)
- Phase screen with choice cards
- Result screen with factor breakdown + animation
- Missile trail, radar sweep, hit/miss animations

### Phase 5: After-Action Report (Frontend)
- Full timeline view of all phases
- "What-if" optimal play comparison
- Integration with existing damage/fatigue system

### Phase 6: Integration with Tycoon Layer
- Missions now specify required platform type (air/naval)
- Buying aircraft/ships from the real catalog
- Mission rewards scale with battle performance (not just win/lose)
- Unit damage from battle feeds back into maintenance system
