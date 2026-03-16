# Immersion Upgrade — Subsystem Diagram, Mission Objectives, Battle Variety

**Date:** 2026-03-16
**Status:** Approved design

---

## Problem

1. **Subsystem view is a flat grid** — 6 text cards don't feel like working on an aircraft. No visual connection between module and its physical location on the plane.
2. **Only 4 missions, all identical 1v1** — no mission variety, no objectives, no reason to replay. Chapters mix air/naval randomly.
3. **No battle scenario variety** — every air battle is the same "close and shoot" loop regardless of mission context.

---

## Feature 1: Aircraft Diagram with Subsystem Hotspots

### Design
A generic fighter jet SVG silhouette with 6 interactive hotspot zones at realistic locations:

| Zone position | Subsystem | Why there |
|---------------|-----------|-----------|
| Nose cone | RADAR | Radar antenna is in the nose radome |
| Cockpit area | COMPUTER | Mission computer is behind the pilot |
| Rear/tail | ENGINE | Engines are at the back |
| Underbelly | AIRFRAME | Structural fuselage center |
| Mid-body sides | ECM | ECM pods mount on pylons/wings |
| Tail base | COUNTERMEASURES | Chaff/flare dispensers at tail |

### Interaction
- Each zone shows a pulsing dot colored by condition (green/amber/red)
- Tap a zone → module detail card slides in below
- Detail card shows: module name, key stat, condition bar, [SWAP] button
- Performance summary below the diagram shows computed stats

### Implementation
- Create `AircraftDiagram.tsx` component — inline SVG with clickable zones
- One generic fighter silhouette (CSS/SVG path) for all aircraft
- Zone positions as absolute-positioned divs over the SVG
- Replace the 2x3 grid in Hangar.tsx with this component

---

## Feature 2: Mission Objectives

### New field on MissionTemplate
```
mission_objective: str  # "air_superiority", "interception", "escort", "strike", "recon",
                        # "naval_patrol", "blockade_run", "fleet_defense"
difficulty: int  # 1-3 (determines enemy selection from catalog)
```

### Objective definitions

| Objective | Start range | Max turns | Enemy doctrine | Win condition |
|-----------|-------------|-----------|----------------|---------------|
| air_superiority | 250km | 20 | Varies | Destroy or force disengage |
| interception | 350km | 12 | CAUTIOUS (fleeing) | Destroy before they escape |
| escort | 150km | 15 | AGGRESSIVE | Survive with <50% damage |
| strike | 250km | 18 | STANDOFF | Reach range <20km |
| recon | 200km | 15 | CAUTIOUS | Scan all 6 intel + disengage |
| naval_patrol | 350km | 15 | Varies | Standard naval combat |
| blockade_run | 300km | 12 | DEFENSIVE | Close to <100km |
| fleet_defense | 200km | 15 | AGGRESSIVE | Survive 10+ turns |

### Enemy selection
Instead of hardcoded `enemy_aircraft_id`, missions specify `difficulty` (1-3):
- Tier 1: JF-17, Tejas (budget fighters)
- Tier 2: F-16, Mirage 2000, Su-30MKI (mid-tier)
- Tier 3: Rafale, Typhoon, F-15E (top-tier)

Engine picks a random enemy from the appropriate tier. Player always chooses from their own hangar.

### Engine changes
- `TacticalAirBattleEngine.__init__()` accepts `objective: str`
- Objective sets `max_turns`, `range_km`, and enemy doctrine override
- `_check_exit()` adds objective-specific win conditions
- New exit reasons: `objective_complete`, `objective_failed`
- Success determination changes per objective (escort: survival, recon: intel gathered)

---

## Feature 3: Expanded Mission Templates

### Sahara Crisis (Chapter 1, min_rank=0)
- "Desert Patrol" — air_superiority, difficulty 1 (easy intro)
- "Convoy Escort" — escort, difficulty 2 (survive incoming)
- "Air Dominance" — air_superiority, difficulty 2 (chapter climax)

### Pacific Tensions (Chapter 2, min_rank=1)
- "Strait Patrol" — naval_patrol, difficulty 1
- "Air Cover" — escort, difficulty 2 (protect naval asset)
- "Surface Action" — naval_patrol, difficulty 2

### Arctic Shadow (Chapter 3, min_rank=2)
- "Northern Intercept" — interception, difficulty 2 (catch the runner)
- "Shadow Recon" — recon, difficulty 2 (intel-only mission)
- "Arctic Dominance" — strike, difficulty 3 (reach the target)

### Standalone (always available, repeatable)
- "Training Sortie" — air_superiority, difficulty 1
- "Fleet Defense Drill" — fleet_defense, difficulty 1

---

## Implementation Order

1. **Aircraft diagram SVG** — Create AircraftDiagram.tsx, replace grid in Hangar
2. **Mission objective model** — Add fields to MissionTemplate, update seed data
3. **Engine objective support** — Pass objective to engine, adjust win conditions
4. **Expanded missions** — Seed 11 missions with proper chapters + difficulty
5. **Enemy selection by difficulty** — Replace hardcoded enemy_aircraft_id with tier-based selection

---

## Research Sources
- Audit of current mission flow found only 4 missions, all identical 1v1
- Chapter system groups mixed air/naval (semantically broken)
- Rank gating exists in model but UI doesn't enforce
