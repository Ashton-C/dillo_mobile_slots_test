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
    habitat.tsx        # Base builder — OutpostMap, drone contracts, build queue
    hangar.tsx         # RADAR — SectorMap, target discovery, BREACH (roulette) / EXTRACT (blackjack)
    rift.tsx           # Temporal Rift selector (also accessible from spin screen)
    pilot.tsx          # Pilot profile — XP, stats, customization, combat log
    store.tsx          # IAP packs, Stardust ladder, watch-an-ad rewards, cosmetics
    dev.tsx            # Hidden debug screen (tab hidden via tabBarButton)
    _layout.tsx        # Tab bar config

src/
  components/
    BlackjackMiniGame.tsx   # PvP extraction mini-game (blackjack hand)
    RouletteGame.tsx        # PvP breach mini-game (roulette wheel)
    CombatMiniGame.tsx      # Legacy 3-reel insta-stop game (kept for fallback)
    SectorMap.tsx           # Sector-based RADAR discovery grid
    SectorTrailMap.tsx      # Visited-sector trail visualization
    OutpostMap.tsx          # Node-based base layout on Habitat tab
    BuildingDetailModal.tsx # Per-building upgrade sheet
    OutpostDetailModal.tsx  # Outpost-level upgrade sheet
    SkipBuildModal.tsx      # Spend Stardust to instantly finish a build
    SpinRefillModal.tsx     # 0-spin recovery: wait, watch ad, or buy refill
    LedgerDrawer.tsx        # Swipe-up history of last 20 spins with receipts
    BuildCompleteBanner.tsx # Slide-in completion notice
    CombatResolutionChip.tsx# Compact raid result chip
    CosmeticCategoryGrid.tsx# Cosmetics grid (per category)
    CosmeticPurchaseModal.tsx # Buy/equip flow with preview
    CosmeticPreview.tsx     # Live preview tile
    OnboardingCarousel.tsx  # First-launch 5-card swipe walkthrough
    OnboardingModal.tsx     # First-launch 3-step task gate
    JackpotBurst.tsx        # JACKPOT win ceremony animation
    ConfettiEmitter.tsx     # Particle burst on big wins
    AdWatchModal.tsx        # Rewarded-ad fallback modal (Expo Go)
    HexFrame.tsx, TopBar.tsx, IconButton.tsx, TooltipPopover.tsx, LegendCard.tsx, OddsModal.tsx, DroneCard.tsx, CreditCounter.tsx
    PilotAvatar.tsx, DroneMarketplace.tsx, EventBanner.tsx, ModifierPanel.tsx, ReelDisplay.tsx, ResourceBar.tsx, RiftSelector.tsx, SpinButton.tsx, UsernameSetupModal.tsx

  models/
    Drone.ts           # DroneContract definitions, cost schemas
    Habitat.ts         # BuildingType, upgrade costs, build durations, outpost helpers
    User.ts            # Player profile + resource schema

  services/
    SlotsEngine.ts             # Weighted random slot engine, rift modifiers, payout tables
    FirestoreService.ts        # All Firestore read/write operations (typed)
    AnomalyService.ts          # Global 4-hour weather event sync (Firestore)
    DroneMercenaryService.ts   # Effect aggregation for active drones
    CosmeticsService.ts        # 50-item catalog, token maps, bundle grants
    StoreService.ts            # IAP pack table (`PACKS`), reward shape
    IapService.ts              # RevenueCat wrapper + Customer Center + paywall + Expo Go stub
    AdsService.ts              # AdMob rewarded + interstitial + Expo Go stub
    SoundService.ts            # SFX dispatch (asset slots in `ASSETS.md`)

  store/
    useAnomalyStore.ts   # Space Anomaly state + Firestore subscription
    useAuthStore.ts      # Firebase Auth, user profile, player index writes
    useCosmeticsStore.ts # Owned + equipped cosmetics, buy/equip/bundle expansion
    useDroneStore.ts     # Active drones, deploy/tick lifecycle
    useEventStore.ts     # Incoming PvP event queue, dismiss logic
    useGameStore.ts      # All player resources (incl. Stardust), spin logic, buff management
    useHabitatStore.ts   # Building levels, active build job, outpost level, grid config

  lib/
    firebase.ts        # Firebase app init (auth + Firestore)

  constants/
    theme.ts           # Colors, Typography, Spacing, BorderRadius

functions/
  src/index.ts         # Cloud Functions: resolveCombat, refillSpins, revenueCatWebhook
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
| Breach Keys | ⚔ | Spinning (INTRUSION symbol) | RADAR → BREACH (roulette) |
| Extraction Beams | ⛏ | Spinning (EXTRACTION symbol) | RADAR → EXTRACT (blackjack) |
| Stardust | ✦ | JACKPOT (5 ✦), outpost level-up (10 ✦), blackjack-extract wins (1 ✦), IAP | Instant build/outpost skips (`SkipBuildModal`) |

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

1. Open the `SectorMap` and pick a sector to scan — targets are pulled from `playerIndex` with threat tiers (WEAK / EVEN / STRONG) based on the defender's Outpost Level
2. Tap **BREACH** (costs 1 Breach Key) → `RouletteGame` mini-game, or **EXTRACT** (costs 1 Extraction Beam) → `BlackjackMiniGame`
3. Each mini-game produces a power value (or a bust); a `combatRequest` doc is written to Firestore
4. The `resolveCombat` Cloud Function applies TURRET (daily auto-block charges) and VAULT (credit loss reduction) passives, computes the outcome, and writes events to both players' `users/{uid}/events` subcollections
5. The defender sees an `EventBanner` slide in on next foreground; the attacker sees a `CombatResolutionChip` with the power delta and any loot

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

- **Server authority:** Combat resolution happens in a Cloud Function, not the client. Clients write requests; the server writes results. IAP grants also flow through a server webhook (`revenueCatWebhook`) — the client only grants stubbed rewards in Expo Go.
- **Path alias:** `@/*` maps to `./src/*` — configured in `tsconfig.json` and `babel.config.js`.
- **Type checking:** `npx tsc --noEmit`
- **Tests:** `npx jest --no-watch` — 37 passing covering SlotsEngine math, payouts, rift modifiers, multiline evaluation.
- **Cloud Functions:** `functions/src/index.ts` contains `resolveCombat`, scheduled `refillSpins`, and `revenueCatWebhook`. Deploy via `npm run deploy:functions` (scopes to `resolveCombat` by default; `-- --all` to deploy everything).
- **EAS builds:** see `EAS_BUILD_RUNBOOK.md`. Native modules (AdMob, RC) require a dev-client or production build — Expo Go falls back to stubs.
- **Closed testing:** see `DEPLOY_CHECKLIST.md` for the iOS/Android submission flow and `MONETIZATION_CHECKLIST.md` for the RC + AdMob + IAP product registration gates.

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
