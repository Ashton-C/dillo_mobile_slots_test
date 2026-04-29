# Sovereign Slots — Progress & Roadmap

**Current Phase:** Phase 3 (Social Combat) — mostly complete, Cloud Function pending
**Last Updated:** 2026-04-29

---

## Phase 1: Engine Foundation ✅

The minimum viable slot game — engine, auth, base construction, and Firestore sync.

- [x] Expo + Expo Router project init with Zustand state management
- [x] `SlotsEngine` — weighted random draw, 6-symbol reel, payout tables for triple/pair
- [x] Firebase Auth (anonymous) + Firestore initial data models (`users`, `habitats`)
- [x] `HabitatBuilder` — 5 buildings (GENERATOR, ARMORY, VAULT, TURRET, HANGAR), real-time build timers (30s → 72h), Firestore persistence, builder-busy lock
- [x] Pilot profile — first-launch username modal, XP bar, rename flow
- [x] Spin energy timer — drip-refill at 1 spin / 5 min (max 50), countdown display on Spin screen

---

## Phase 2: Strategic Systems ✅

The mechanics that differentiate Sovereign Slots from Coin Master.

- [x] **Space Anomalies** — global 4-hour weather events via `anomalies/current` Firestore doc; `AnomalyService` with local tick
- [x] **Temporal Rifts** — 4 tiers (0–3), each shifting reel weights toward credits or combat tokens; costs Credits per spin
- [x] **Drone Mercenaries** — 4 drone types (SENTINEL, SCRAMBLER, HARVESTER, RAIDER), stacking effect aggregation, `useDroneStore`
- [x] **FUEL CELLS** (attacks) + **SIGNAL BOOSTERS** (raids) — renamed and repurposed as consumable spin buffs:
  - Overclock (1 Fuel Cell) → flat credit bonus on next spin (scales with GENERATOR level)
  - Signal Boost (1 Signal Booster) → credit symbol weights ×1.5 on next spin
- [x] **ModifierPanel** — active effects display: combined credit multiplier, rift tier, active drones, anomaly countdown; tap to toggle dots ↔ numbers mode (persisted to AsyncStorage)
- [x] **Outpost Level System** — master gate (1–10) blocking buildings from exceeding outpost level; upgrade flow with real-time timer, Firestore persistence
- [x] **Drone Marketplace** — bottom-sheet modal from Habitat screen (CONTRACTS button, visible when HANGAR ≥ 1); atomic resource deduction
- [x] **Brand polish** — LinearGradient header on Spin screen, jackpot flash animation, SpinButton pulse glow, low-spin color warning, `ArmadilloAvatar` component

---

## Phase 3: Social Combat 🔨

PvP loop built around the insta-stop mechanic — skill meets RNG, on-brand with the slot theme.

### Design decisions (locked)
- **PvP mini-game:** 3 mini-reels cycling at different speeds (130/160/190ms). Player taps each to lock; 3s auto-stop if idle. Power = random base + match bonus (triple +30, pair +15) + Outpost Level × 10. Highly thematic, minimal learning curve.
- **Drone UI:** Modal from Habitat screen — not a dedicated tab.
- **AdMob:** Deferred to Phase 4.
- **Outpost gate:** Hard gate — buildings can't exceed current Outpost Level.

### Completed
- [x] Outpost Level System — hard gate, upgrade flow, UI on Habitat screen
- [x] Drone Marketplace — CONTRACTS modal, hire flow, atomic resource deduction
- [x] INTRUSION + EXTRACTION symbols — added to `SlotsEngine` weight tables and payout tables; tracked in `useGameStore` and persisted to Firestore
- [x] **RADAR screen** (repurposed from Hangar tab) — scans `playerIndex` for 5 nearby targets, threat assessment (WEAK/EVEN/STRONG), BREACH + EXTRACT action buttons
- [x] **CombatMiniGame** — insta-stop modal: 3 reels at staggered speeds, tap-to-lock, 3s auto-stop, power evaluation, writes `combatRequest` to Firestore
- [x] **EventBanner** — Reanimated slide-down notification for all PvP event types; auto-dismisses at 5s; wired into root layout
- [x] **useEventStore** — Firestore `users/{uid}/events` subcollection subscription, event deduplication, active-event queue
- [x] **Player index writes** — `useAuthStore` writes to `playerIndex` on login and on display name change
- [x] **Resource deduction on launch** — BREACH/EXTRACT deduct from inventory before mini-game opens
- [x] **Combat log on Pilot tab** — last 20 events with relative timestamps and color-coded dots

### Remaining
- [x] **Firebase security rules** — `playerIndex`, `users/{uid}/events`, `combatRequests` all covered
- [x] **Cloud Function `resolveCombat`** — Firestore trigger on `combatRequests` create; computes outcome, applies VAULT/TURRET passives, writes events to both players, updates credits (`functions/src/index.ts`)
- [x] **TURRET passive** — daily charge tracking (`turretCharges` + `turretResetAt` on habitat doc); auto-block consumes one charge per incoming attack up to TURRET level per day
- [x] **VAULT passive** — reduces defender credit loss by `vaultLevel × 5%` (max 75%) on successful raid
- [ ] **Deploy Cloud Function** — `cd functions && npm install && npm run build && firebase deploy --only functions`
- [ ] **Seed mock users** — `node scripts/seed-mock-users.js` (run once; populates AlphaRaider + BetaOps in playerIndex for RADAR testing)

---

## Phase 4: Monetization 📋

Hard currency, IAP, and rewarded ads. Build the social loop fully before adding monetization pressure.

- [ ] **Temporal Crystals** — hard currency (distinct from Credits); earned via IAP or sparingly via gameplay
- [ ] **RevenueCat integration** — Spin Packs, Builder Slots (parallel construction unlock), Shield Bundles
- [ ] **AdMob rewarded ads** — "+5 spins" and "−30 min from active build timer" placements
- [ ] **Instant build skip** — spend Temporal Crystals to instantly complete any build job

---

## Phase 5: Polish & Launch 📋

- [ ] Unit tests — `SlotsEngine` payout math, weight normalization, Rift modifiers
- [ ] Integration tests — Zustand store actions, Firestore write/read round-trips
- [ ] Onboarding tutorial — first-run flow: spin → build → deploy drone
- [ ] Armadillo customization — color/accessory picker on Pilot screen
- [ ] Particle effects — jackpot confetti, screen shake on incoming attacks, reel symbol animations
- [ ] Push notifications — "your build is complete", "you were raided" (FCM)
- [ ] App Store / Play Store submission

---

## System Health

| System | Status | Notes |
|---|---|---|
| SlotsEngine | ✅ Solid | 9 symbols, rift modifiers, signal boost, full payout table |
| useGameStore | ✅ Solid | All resources, spin buffs, Firestore sync |
| useHabitatStore | ✅ Solid | Outpost gate, build timers, Firestore persistence |
| useDroneStore | ✅ Solid | Deploy/tick/expire lifecycle |
| useAnomalyStore | ✅ Solid | Global sync via onSnapshot |
| useEventStore | ✅ New | Firestore events subscription, needs CF to write events |
| useAuthStore | ✅ Solid | Player index writes added |
| FirestoreService | ✅ Solid | All collections covered; CF integration pending |
| RADAR screen | ✅ New | Needs real playerIndex data to populate |
| CombatMiniGame | ✅ New | Client-side only; outcomes pending CF |
| EventBanner | ✅ New | Fully wired; events pending CF writes |
| Cloud Function | ✅ Written | Needs deploy: `cd functions && npm run build && firebase deploy --only functions` |
| TURRET/VAULT passives | ✅ Written | Wired inside resolveCombat CF |
| Security rules | ✅ Complete | playerIndex, events subcollection, combatRequests all covered |
| Mock users | ✅ Written | Run `node scripts/seed-mock-users.js` to populate RADAR targets |
