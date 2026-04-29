# CLAUDE.md — Sovereign Slots

Instructions and context for AI assistants working on this codebase. Read this before touching any file.

---

## Project Identity

**Sovereign Slots** is a cozy sci-fi social-casino mobile game — think "Coin Master evolved." The core thesis is replacing passive, victim-based RNG with **active, strategy-based manipulation**. Players tune the slot engine, build a sci-fi outpost, deploy drone mercenaries, and run PvP raids on other players.

**Protagonist:** A customizable Armadillo in a high-tech environmental suit.
**Aesthetic:** "Cozy Punk" — low-fi space station meets vibrant sunset. Dark mode, orange-to-purple neon gradients, thin geometric sans-serif type. Every screen should feel lean and intentional.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native + Expo 51, Expo Router (file-based routing) |
| Language | TypeScript (strict) |
| State | Zustand (client) + React Query (server sync) |
| Validation | Zod |
| Backend | Firebase Auth (anonymous) + Firestore |
| Animations | React Native Reanimated ~3.10 |
| Haptics | expo-haptics |
| Gradients | expo-linear-gradient |

**Path alias:** `@/*` → `./src/*` (configured in `tsconfig.json` + `babel.config.js`).

---

## Architecture Principles

### State ownership
- **Zustand stores** own all client state. Never use `useState` for data that needs to be shared across screens.
- **Firestore** is the source of truth for resources, habitat, and events. Stores sync from Firestore via `onSnapshot` — never read directly from Firestore in components.
- **Server authority:** Combat resolution and resource changes from PvP happen in Cloud Functions, not the client. The client writes *requests*; the server writes *results*.

### File organization
- `src/services/` — singleton service classes and Firestore I/O functions. One file per major system.
- `src/store/` — Zustand stores. Each store owns one domain (game resources, habitat, drones, auth, events, anomaly).
- `src/models/` — plain data types, Zod schemas, static config objects (costs, durations).
- `src/components/` — reusable UI components. Screens live in `app/(tabs)/`.
- `src/constants/theme.ts` — the single source for all Colors, Typography sizes, Spacing, and BorderRadius.

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
- **Never add a new currency without thinking through inflation.** Drone Fuel, Signal Boosters, Breach Keys, etc. must have clear caps and sinks. Check that new resources don't make Credits redundant.
- **Spin energy is a core engagement driver.** Max 50 spins, refill at 1 per 5 minutes. Do not change these values lightly — they anchor the daily session loop.

### Buildings
- **Outpost Level is the hard gate.** Buildings cannot be upgraded past the current Outpost Level. This gate must be enforced in `useHabitatStore.startBuild()` — never relax it client-side.
- **Build times must feel meaningful at high tiers.** Level 1–3: seconds to minutes. Level 7–10: 12–72 hours. IAP pressure comes from impatience, not desperation.

### PvP
- **Combat is RNG + skill.** The `CombatMiniGame` insta-stop mechanic is the skill layer. Don't replace it with pure RNG or pure player choice.
- **Never resolve PvP client-side.** Clients write `combatRequests`. The Cloud Function resolves outcomes, applies VAULT/TURRET passives, and writes to both players' event logs.

### UI
- **Flat hierarchy.** Maximum one drill-down from any tab. If a screen needs two taps to reach, reconsider the architecture.
- **SPIN is the single entry point.** Everything else is support for the spin loop.
- **No gratuitous decoration.** Particle effects and animations must serve feedback, not fill space.

---

## Key Files Reference

| File | What it does |
|---|---|
| `src/services/SlotsEngine.ts` | Weighted slot engine, rift modifiers, signal boost, payout tables |
| `src/store/useGameStore.ts` | All player resources + spin logic + buff state |
| `src/store/useHabitatStore.ts` | Building levels, active build job, outpost level, outpost gate |
| `src/store/useAuthStore.ts` | Firebase Auth lifecycle, player index writes |
| `src/store/useEventStore.ts` | Incoming PvP event queue |
| `src/services/FirestoreService.ts` | All Firestore operations — the only file that touches `firebase/firestore` |
| `src/models/Habitat.ts` | Building types, upgrade costs (`BUILDING_UPGRADE_COST`), build durations (`BUILD_DURATION_MS`), outpost helpers |
| `src/models/Drone.ts` | `DRONE_CONTRACTS` — drone definitions, costs, durations, effects |
| `src/constants/theme.ts` | Design tokens — Colors, Typography, Spacing, BorderRadius |
| `app/_layout.tsx` | Root layout — auth init, global intervals (anomaly, habitat tick, spin refill, generator income), EventBanner |
| `app/(tabs)/spin.tsx` | Main game screen |
| `app/(tabs)/habitat.tsx` | Building management + DroneMarketplace modal |
| `app/(tabs)/hangar.tsx` | RADAR screen — PvP discovery and combat launch |
| `app/(tabs)/pilot.tsx` | Pilot profile, stats, combat log |

---

## Firestore Collections

| Collection | Who writes | Who reads |
|---|---|---|
| `users/{uid}` | Client (resources, profile) | Client |
| `users/{uid}/events` | Cloud Function | Client (onSnapshot) |
| `habitats/{habitatId}` | Client | Client |
| `anomalies/current` | Cloud Function / admin | Client (onSnapshot) |
| `playerIndex/{uid}` | Client (on login + rename) | Client (RADAR scan) |
| `combatRequests` | Client | Cloud Function |

---

## Current Roadmap Status

See **[progress.md](./progress.md)** for the full phase breakdown with completion status.

**Phase 1** (Engine Foundation) ✅ complete
**Phase 2** (Strategic Systems) ✅ complete
**Phase 3** (Social Combat) 🔨 mostly complete — Cloud Function + TURRET/VAULT passives remaining
**Phase 4** (Monetization) 📋 not started
**Phase 5** (Polish & Launch) 📋 not started

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

9. **The combat loop is incomplete without the Cloud Function.** `combatRequests` are written client-side but not yet resolved. Don't design features that assume resolution has happened until the Cloud Function exists.

10. **Reference progress.md for scope.** Before starting any new feature, check if it's in the current phase. If it's Phase 4+ work, flag it rather than implementing it speculatively.
