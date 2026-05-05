# Reelwright

A cozy cosmic-frontier social-casino mobile game for iOS and Android. Built with Expo + React Native.

The core thesis: evolve the "Coin Master" formula by replacing passive, victim-based RNG with **active, strategy-based manipulation**. Players don't just spin and pray — they tune the slot engine, build a frontier homestead, deploy hired hands, and run tactical PvP raids on other players.

---

## Aesthetic

**"Cozy Frontier"** — low-fi space station meets desert sunset. Dark backgrounds, orange-to-purple neon gradients, geometric sans-serif type. The player character is a customizable **frontier pilot in a high-tech environmental suit**.

---

## Core Loop

```
SPIN → earn Credits, Fuel Cells, Signal Boosters, Shields, Breach Keys, Extraction Beams
  ↓
BUILD → spend Credits on real-time base construction (GENERATOR, ARMORY, VAULT, TURRET, HANGAR)
  ↓
STRATEGIZE → tune the slot engine (Temporal Rifts), deploy drones, activate spin buffs
  ↓
RAID → use Breach Keys / Extraction Beams to attack other players via the RADAR screen
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.83 + Expo SDK 55 (Expo Router — file-based routing) |
| Language | TypeScript (strict) |
| State | Zustand |
| Validation | Zod |
| Backend | Firebase Auth (anonymous) + Firestore |
| Animations | React Native Reanimated 4 (worklets-based) |
| Audio | expo-audio |
| Haptics | expo-haptics |
| Gradients | expo-linear-gradient |

---

## Project Structure

```
app/
  _layout.tsx          # Root layout — auth init, global timers, EventBanner
  (tabs)/
    spin.tsx           # Main spin screen — reels, quick actions, rift selector
    habitat.tsx        # Base builder — buildings, outpost upgrade, drone contracts
    hangar.tsx         # RADAR screen — PvP target discovery, BREACH/EXTRACT
    rift.tsx           # Temporal Rift selector (also accessible from spin screen)
    pilot.tsx          # Pilot profile — XP, stats, combat log
    _layout.tsx        # Tab bar config

src/
  components/
    PilotAvatar.tsx         # Procedural pilot avatar from RN primitives
    CombatMiniGame.tsx      # Insta-stop PvP mini-game (3 cycling reels, tap to lock)
    DroneMarketplace.tsx    # Drone hire modal (CONTRACTS button on Habitat screen)
    EventBanner.tsx         # Slide-down PvP notification banner
    ModifierPanel.tsx       # Active effects panel (Rift + Anomaly + Drones) — dots/numbers toggle
    ReelDisplay.tsx         # Animated slot reel display (3 cells)
    ResourceBar.tsx         # Top HUD bar (credits, fuel, boost, shields, spins)
    RiftSelector.tsx        # Temporal Rift tier selector
    SpinButton.tsx          # Main spin button with pulse glow animation
    UsernameSetupModal.tsx  # First-launch display name prompt

  models/
    Drone.ts           # DroneContract definitions, cost schemas
    Habitat.ts         # BuildingType, upgrade costs, build durations, outpost helpers

  services/
    AnomalyService.ts          # Global 4-hour weather event sync (Firestore)
    DroneMercenaryService.ts   # Effect aggregation for active drones
    FirestoreService.ts        # All Firestore read/write operations (typed)
    SlotsEngine.ts             # Weighted random slot engine, rift modifiers, payout tables

  store/
    useAnomalyStore.ts   # Space Anomaly state + Firestore subscription
    useAuthStore.ts      # Firebase Auth, user profile, player index writes
    useDroneStore.ts     # Active drones, deploy/tick lifecycle
    useEventStore.ts     # Incoming PvP event queue, dismiss logic
    useGameStore.ts      # All player resources, spin logic, buff management
    useHabitatStore.ts   # Building levels, active build job, outpost level

  constants/
    theme.ts           # Colors, Typography, Spacing, BorderRadius
```

---

## Getting Started

### Prerequisites

- Node 18+
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator / Android Emulator, or the **Expo Go** app on a real device

### Install

```bash
npm install
```

### Firebase

This project requires a Firebase project. See **[firebase_setup.md](./firebase_setup.md)** for the full walkthrough (~15 minutes). You'll need:

1. A Firestore database
2. Anonymous Auth enabled
3. An `.env.local` file with your Firebase config keys:

```env
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
```

### Run

```bash
# Local network (real device)
npx expo start --lan

# iOS Simulator
npx expo start --ios

# Android Emulator
npx expo start --android
```

---

## Game Systems

### Slot Engine (`SlotsEngine.ts`)

Weighted random draw across 9 symbols. Weights are defined in `BASE_WEIGHTS` and modified by:

- **Temporal Rift tier** (0–3): shifts probability toward credit or combat symbols
- **Signal Boost**: multiplies all credit symbol weights by ×1.5 for one spin (costs 1 Signal Booster)

Evaluation order: triple → pair (center+right or left+center) → outer pair → nothing.

### Resources

| Resource | Symbol | Earned by | Spent on |
|---|---|---|---|
| Credits | ◈ | Spinning, Generator passive | Buildings, Temporal Rifts |
| Fuel Cells | ⚡ | Spinning (ATTACK symbol) | Overclock spin buff |
| Signal Boosters | ▲▲ | Spinning (RAID symbol) | Signal Boost spin buff |
| Shields | ◉ | Spinning (SHIELD symbol) | Defense (passive) |
| Breach Keys | ⚔ | Spinning (INTRUSION symbol) | RADAR → BREACH attack |
| Extraction Beams | ⛏ | Spinning (EXTRACTION symbol) | RADAR → EXTRACT raid |

### Buildings

All buildings are gated by **Outpost Level** — a building can't exceed the current Outpost level. Max level for both is 10.

| Building | Effect |
|---|---|
| GENERATOR | Passive credit income (+level × 20 CR every 30s) |
| ARMORY | Fuel Cell storage cap (+5 per level, base 50) |
| VAULT | Reduces credit loss when raided (5% per level, max 50%) |
| TURRET | Auto-blocks N incoming attacks per day (no credit loss when active) |
| HANGAR | Unlocks drone slots (1 slot per level) |
| BARRACKS | Spin storage cap (+5 per level, base 50) |

### PvP (RADAR Screen)

1. Scan for nearby targets from the `playerIndex` collection
2. Tap **BREACH** (costs 1 Breach Key) or **EXTRACT** (costs 1 Extraction Beam)
3. **CombatMiniGame** opens: 3 reels cycle at different speeds — tap each to lock it (skill element), or wait for 3s auto-stop
4. Power is calculated from reel pattern + Outpost Level bonus
5. A `combatRequest` doc is written to Firestore — a Cloud Function resolves the outcome and delivers results via `users/{uid}/events`

### Space Anomalies

A single `anomalies/current` document in Firestore drives a global 4-hour weather event. Anomalies modify credit multipliers, spawn rates, or other parameters for every player simultaneously.

### Drone Mercenaries

Deployed from the **CONTRACTS** modal on the Habitat screen (requires HANGAR ≥ 1). Four drone types:

| Drone | Effect | Duration |
|---|---|---|
| SENTINEL | Blocks next incoming attack | 1 use |
| SCRAMBLER | Reduces attacker's reel accuracy | X spins |
| HARVESTER | Multiplies credit winnings | X spins |
| RAIDER | Boosts raid loot bonus | X spins |

---

## Firestore Collections

| Collection | Purpose |
|---|---|
| `users/{uid}` | Player resources, XP, level, display name |
| `users/{uid}/events` | Incoming PvP event log (written by Cloud Function) |
| `habitats/{habitatId}` | Building levels, active build job, outpost level |
| `anomalies/current` | Active global space anomaly |
| `playerIndex/{uid}` | Discoverable player profiles for RADAR |
| `combatRequests` | Pending PvP actions (Cloud Function resolves) |

---

## Development Notes

- **Server authority:** Combat resolution happens in a Cloud Function, not the client. Clients write requests; the server writes results.
- **Path alias:** `@/*` maps to `./src/*` — configured in `tsconfig.json` and `babel.config.js`.
- **Type checking:** `npx tsc --noEmit`
- **No test suite yet** — SlotsEngine unit tests are on the Phase 4 backlog.

---

## Appendix: Max Upgrade Credit Costs

Total credits required to max-level every building and the Outpost from scratch.

Upgrade cost formula: `COST(level) = base_rate × level`, summed level 1 → 10.  
Sum of levels 1–10 = 55. Sum of levels 1–9 (Outpost starting at Lv1) = 45.

### Buildings (Lv 0 → 10)

| Building | Rate / level | Total to Lv 10 | Effect at max |
|---|---|---|---|
| GENERATOR | 200 CR × lvl | **11,000 CR** | +200 CR/30s · Overclock +500 CR flat |
| ARMORY | 300 CR × lvl | **16,500 CR** | Max 100 fuel cells stored |
| VAULT | 350 CR × lvl | **19,250 CR** | Raiders steal 15% of credits (−50% base) |
| TURRET | 500 CR × lvl | **27,500 CR** | Auto-blocks 10 attacks/day |
| HANGAR | 1,000 CR × lvl | **55,000 CR** | 10 drone contract slots |
| BARRACKS | 200 CR × lvl | **11,000 CR** | Max 100 spins stored |

### Outpost (Lv 1 → 10)

| Outpost upgrade | Cost | Rate |
|---|---|---|
| Lv 1 → 2 | 500 CR | — |
| … | … | 500 CR × current level |
| Lv 9 → 10 | 4,500 CR | — |
| **Total** | **22,500 CR** | Sum levels 1–9 × 500 |

### Grand Total

| Category | Credits |
|---|---|
| All 6 buildings to Lv 10 | 140,250 CR |
| Outpost to Lv 10 | 22,500 CR |
| **Full base max-out** | **162,750 CR** |

> Note: only one building slot can be under construction at a time. Sequential build time to max everything is on the order of weeks at high tiers (Lv 8–10 takes 24–72 hours each).
