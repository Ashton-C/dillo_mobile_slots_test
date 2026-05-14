# CLAUDE.md — Reelwright

Instructions and context for AI assistants working on this codebase. Read this before touching any file.

---

## Project Identity

**Reelwright** is a cozy cosmic-frontier social-casino mobile game — think "Coin Master evolved." The core thesis is replacing passive, victim-based RNG with **active, strategy-based manipulation**. Players tune the slot engine, build a frontier homestead, deploy hired hands, and run PvP raids on other players.

**Protagonist:** A customizable frontier pilot in a high-tech environmental suit.
**Aesthetic:** "Cozy Frontier" — low-fi space station meets desert sunset. Dark mode, orange-to-purple neon gradients, thin geometric sans-serif type. Every screen should feel lean and intentional.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.83 + Expo SDK 55, Expo Router (file-based routing) |
| Language | TypeScript (strict) |
| State | Zustand |
| Validation | Zod |
| Backend | Firebase Auth (anonymous) + Firestore |
| Animations | React Native Reanimated 4 (worklets-based) |
| Audio | expo-audio |
| Haptics | expo-haptics |
| Gradients | expo-linear-gradient |
| Architecture | New Architecture (Fabric + TurboModules) — default in RN 0.83 |

**Path alias:** `@/*` → `./src/*` (configured in `tsconfig.json` + `babel.config.js`).

---

## Architecture Principles

### State ownership
- **Zustand stores** own all client state. Never use `useState` for data that needs to be shared across screens.
- **Firestore** is the source of truth for resources, habitat, and events. Stores sync from Firestore via `onSnapshot` — never read directly from Firestore in components.
- **Server authority:** Combat resolution and IAP grants happen in Cloud Functions, not the client. The client writes *requests* (`combatRequests`); the server writes *results* (events, resource updates). Real IAP grants flow through `revenueCatWebhook` with `iapTransactions/{id}` idempotency — the client only grants stub rewards in Expo Go.

### File organization
- `src/services/` — singleton service classes and Firestore I/O functions. One file per major system.
- `src/store/` — Zustand stores. Each store owns one domain (game, habitat, drones, auth, events, anomaly, cosmetics).
- `src/models/` — plain data types, Zod schemas, static config objects (costs, durations).
- `src/components/` — reusable UI components. Screens live in `app/(tabs)/`.
- `src/lib/firebase.ts` — Firebase app init (auth + Firestore). Single import point for `auth` / `db`.
- `src/constants/theme.ts` — the single source for all Colors, Typography sizes, Spacing, and BorderRadius.
- `functions/src/index.ts` — all Cloud Functions (`resolveCombat`, scheduled `refillSpins`, `revenueCatWebhook`).

### Always use theme constants
Never hardcode colors, font sizes, or spacing. Import from `@/constants/theme`.

### Firestore writes go through `FirestoreService.ts`
All Firestore reads and writes must go through `src/services/FirestoreService.ts`. Components and stores never import from `firebase/firestore` directly (except `useAuthStore`, which manages the auth subscription).

---

## Code Standards

- **No comments** unless the WHY is genuinely non-obvious (hidden constraint, subtle invariant, specific bug workaround).
- **No feature flags, backwards-compat shims, or unused variables.** Delete dead code.
- **No error handling for impossible cases.** Trust internal code guarantees; only validate at system boundaries (user input, Firestore data).
- **TypeScript strict.** Never use `any`. Prefer `unknown` + narrowing at boundaries.
- **Zod for external data.** Use Zod schemas when reading untyped Firestore data if the shape is complex. Simpler shapes (flat objects) are fine to cast with `as`.
- **Atomic resource updates.** Always use `subtractResources()` for multi-resource deductions — never call multiple individual consume functions in a row.
- **Persist after every state change.** Every store action that changes player resources must call `persistResources()` (or the equivalent `writeUserResources` / `writeHabitatState`) before returning.

---

## Game Design Rules (Non-negotiable)

### Economy
- **Credits are the primary currency.** Every mechanic that spends Credits must have a clear return path. Don't add Credit sinks without a proportional source.
- **Stardust (✦) is the premium soft currency.** Sole sink: build/outpost skips (1 ✦/min building, 2 ✦/min outpost). F2P earn rate is deliberately slow (5 ✦ per JACKPOT, 10 ✦ per outpost level-up, 1 ✦ per blackjack-extract win). IAP ladder is the primary path. Do not redirect Stardust to other sinks — the design depends on the build-skip pressure.
- **Never add a new currency without thinking through inflation.** Drone Fuel, Signal Boosters, Breach Keys, etc. must have clear caps and sinks. Check that new resources don't make Credits redundant.
- **Spin energy is a core engagement driver.** Base max 50 spins (BARRACKS raises the cap), refill at 1 per 5 minutes. Do not change these values lightly — they anchor the daily session loop.

### Buildings
- **Outpost Level is the hard gate.** Buildings cannot be upgraded past the current Outpost Level. This gate must be enforced in `useHabitatStore.startBuild()` — never relax it client-side.
- **Build times must feel meaningful at high tiers.** Level 1–3: seconds to minutes. Level 7–10: 12–72 hours. Prestige levels (11+) reuse the level-10 timer. Monetization pressure comes from impatience, not desperation — Stardust skips and the build-skip IAP ladder are the relief valve.
- **Cost is geometric.** `BUILDING_BASE_COST × 1.9^(level-1)`. Don't flatten this curve without a counter-balancing economy change — the late-game grind is the whole point of Stardust packs.
- **Prestige levels (11–50) grant +5% credit yield per level** via `getOutpostPrestigeMultiplier`. No new grid sizes or paylines past 10 — only the multiplier scales.

### PvP
- **Raids are RNG + skill.** `RouletteGame` (BREACH) and `BlackjackMiniGame` (EXTRACT) carry the skill layer. The legacy `CombatMiniGame` is kept only as a fallback. Don't replace the skill layer with pure RNG or pure player choice.
- **Never resolve PvP client-side.** Clients write `combatRequests`. The `resolveCombat` Cloud Function applies VAULT (credit-loss reduction) and TURRET (daily auto-block charges) passives and writes to both players' event logs.

### UI
- **Flat hierarchy.** Maximum one drill-down from any tab. If a screen needs two taps to reach, reconsider the architecture.
- **SPIN is the single entry point.** Everything else is support for the spin loop.
- **No gratuitous decoration.** Particle effects and animations must serve feedback, not fill space.

---

## Key Files Reference

| File | What it does |
|---|---|
| `src/services/SlotsEngine.ts` | Weighted slot engine, rift modifiers, signal boost, multiline payout tables (`spinRows`) |
| `src/services/FirestoreService.ts` | All Firestore operations — only file that touches `firebase/firestore` (besides `useAuthStore` for the auth subscription) |
| `src/services/AnomalyService.ts` | Global 4-hour weather event sync from `anomalies/current` |
| `src/services/IapService.ts` | RevenueCat wrapper, Customer Center, paywall hooks, Expo Go stub fallback |
| `src/services/AdsService.ts` | AdMob rewarded + interstitial, frequency cap, Expo Go stub fallback |
| `src/services/CosmeticsService.ts` | 50-item catalog, category token maps, bundle grants |
| `src/services/StoreService.ts` | `PACKS` table — IAP product IDs + reward shape (mirrored in `functions/src/index.ts:PACK_REWARDS`) |
| `src/store/useGameStore.ts` | All player resources incl. Stardust, spin logic, buff state, `addStardust`, `subtractStardust`, `grantResources` |
| `src/store/useHabitatStore.ts` | Building levels, active build job, outpost level, outpost gate, `getGridConfig`, `getNumActiveLines` |
| `src/store/useAuthStore.ts` | Firebase Auth lifecycle, ensureUserDoc, player index writes, avatar/outpost color setters |
| `src/store/useEventStore.ts` | Incoming PvP event queue from `users/{uid}/events` |
| `src/store/useCosmeticsStore.ts` | Owned + equipped cosmetics, AsyncStorage + Firestore sync, bundle expansion |
| `src/lib/firebase.ts` | Firebase app init — exports `auth` and `db` |
| `src/models/Habitat.ts` | Building types (incl. BARRACKS), `BUILDING_UPGRADE_COST` (geometric 1.9^), `getBuildDurationMs`, `getOutpostPrestigeMultiplier`, `LEVEL_HARD_CAP`, outpost helpers |
| `src/services/NotificationService.ts` | Expo push registration + token persistence (lazy-required for Expo Go safety) |
| `src/services/DailyRewardService.ts` | Daily-streak claim wrapper + reward preview |
| `src/models/Drone.ts` | `DRONE_CONTRACTS` — drone definitions, costs, durations, effects |
| `src/models/User.ts` | Player profile + resource schema (Zod) |
| `src/constants/theme.ts` | Design tokens — Colors, Typography, Spacing, BorderRadius |
| `app/_layout.tsx` | Root layout — auth init, global intervals (anomaly, habitat tick, spin refill, generator income), EventBanner, onboarding |
| `app/(tabs)/spin.tsx` | Main game screen — reels, modifiers, ledger drawer |
| `app/(tabs)/habitat.tsx` | OutpostMap + BuildingDetailModal + DroneMarketplace + SkipBuildModal |
| `app/(tabs)/hangar.tsx` | RADAR — SectorMap → RouletteGame (BREACH) / BlackjackMiniGame (EXTRACT) |
| `app/(tabs)/pilot.tsx` | Pilot profile, customization, combat log |
| `app/(tabs)/store.tsx` | IAP packs, Stardust ladder, watch-an-ad rewards, cosmetics grid |
| `functions/src/index.ts` | Cloud Functions — `resolveCombat`, scheduled `refillSpins`, `revenueCatWebhook` (incl. refund clawback), `claimDailyReward`, `notifyBuildComplete`, `seedAnomaly` |

---

## Firestore Collections

| Collection | Who writes | Who reads |
|---|---|---|
| `users/{uid}` | Client (resources, profile, ownedCosmetics) + `revenueCatWebhook` (IAP grants) + `resolveCombat` (credit deltas) | Client |
| `users/{uid}/events` | Cloud Function (`resolveCombat`) | Client (onSnapshot) |
| `habitats/{habitatId}` | Client + `resolveCombat` (TURRET charge deductions) | Client |
| `anomalies/current` | Cloud Function / admin | Client (onSnapshot) |
| `playerIndex/{uid}` | Client (on login + rename + outpost level-up) | Client (RADAR scan) |
| `combatRequests` | Client | Cloud Function (`resolveCombat`) |
| `iapTransactions/{id}` | `revenueCatWebhook` (idempotency marker) | Function only |

---

## Current Roadmap Status

See **[progress.md](./progress.md)** for the full phase breakdown with completion status.

**Phase 1** (Engine Foundation) ✅ complete
**Phase 2** (Strategic Systems) ✅ complete
**Phase 3** (Social Combat) ✅ complete — `resolveCombat` deployed, TURRET/VAULT passives live, Roulette + Blackjack mini-games replaced the legacy 3-reel `CombatMiniGame`
**Phase 4** (Monetization) ✅ complete — RevenueCat + AdMob wired, `revenueCatWebhook` deployed, Stardust system live; sandbox purchase verification + store submission still pending
**Phase 5** (Polish & Launch) 🔨 closed testing prep — push notifications + store submission outstanding

---

## AI Instructions

1. **Player agency first.** If a mechanic takes control away from the player, flag it and propose a mitigation before implementing.

2. **Think through inflation.** Before adding or changing any resource, trace the full earn → spend → cap loop. New currencies must not devalue Credits or break existing sinks.

3. **Keep it Cozy Punk.** Every component should be lean and on-aesthetic. Reject over-engineered UIs. If two things can share a screen, they should.

4. **Don't add what wasn't asked for.** A bug fix is a bug fix. A one-off action doesn't need a helper class. Three similar lines are better than a premature abstraction.

5. **Server authority is non-negotiable.** Never move PvP resolution or credit math to the client. If you're about to change a resource in response to a combat action without a Cloud Function call, stop.

6. **Always check theme.ts first.** Before using any literal color, font size, or spacing value, check if it already exists in `src/constants/theme.ts`. Prefer constants.

7. **Run `npx tsc --noEmit` before committing.** Fix any errors you introduced. Pre-existing errors (notably the `firebase.ts` `getReactNativePersistence` export error) can be noted and left; don't introduce new ones.

8. **Write to `playerIndex` when player data changes.** Any action that changes `displayName`, `level`, or `outpostLevel` should also update `playerIndex/{uid}` so RADAR targets stay accurate.

9. **PvP resolution is server-side.** `combatRequests` are resolved by the `resolveCombat` Cloud Function; outcomes land in `users/{uid}/events`. Don't read combat results back on the client between writing the request and the event arriving — let the snapshot listener drive UI.

10. **IAP grants are server-side.** Real purchases route through `revenueCatWebhook`; the client only grants stub rewards in Expo Go. If you add a new pack ID, update both `src/services/StoreService.ts:PACKS` and `functions/src/index.ts:PACK_REWARDS` — they must mirror.

11. **Reference progress.md for scope.** Before starting any new feature, check if it's in the current phase. We're in closed-testing prep — favor QoL and polish over new systems unless explicitly scoped.
