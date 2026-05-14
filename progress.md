# Reelwright — Progress & Roadmap

**Current Phase:** Phase 5 (Polish & Launch) — in progress
**Last Updated:** 2026-05-01

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

The mechanics that differentiate Reelwright from Coin Master.

- [x] **Space Anomalies** — global 4-hour weather events via `anomalies/current` Firestore doc; `AnomalyService` with local tick
- [x] **Temporal Rifts** — 4 tiers (0–3), each shifting reel weights toward credits or combat tokens; costs Credits per spin
- [x] **Drone Mercenaries** — 4 drone types (SENTINEL, SCRAMBLER, HARVESTER, RAIDER), stacking effect aggregation, `useDroneStore`
- [x] **FUEL CELLS** (attacks) + **SIGNAL BOOSTERS** (raids) — renamed and repurposed as consumable spin buffs:
  - Overclock (1 Fuel Cell) → flat credit bonus on next spin (scales with GENERATOR level)
  - Signal Boost (1 Signal Booster) → credit symbol weights ×1.5 on next spin
- [x] **ModifierPanel** — active effects display: combined credit multiplier, rift tier, active drones, anomaly countdown; tap to toggle dots ↔ numbers mode (persisted to AsyncStorage)
- [x] **Outpost Level System** — master gate (1–10) blocking buildings from exceeding outpost level; upgrade flow with real-time timer, Firestore persistence
- [x] **Drone Marketplace** — bottom-sheet modal from Habitat screen (CONTRACTS button, visible when HANGAR ≥ 1); atomic resource deduction
- [x] **Brand polish** — LinearGradient header on Spin screen, jackpot flash animation, SpinButton pulse glow, low-spin color warning, `PilotAvatar` component

---

## Phase 3: Social Combat ✅ (deployed)

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
- [x] **Firebase security rules** — `playerIndex`, `users/{uid}/events`, `combatRequests` all covered
- [x] **Cloud Function `resolveCombat`** — Firestore trigger on `combatRequests` create; computes outcome, applies VAULT/TURRET passives, writes events to both players, updates credits (`functions/src/index.ts`)
- [x] **TURRET passive** — daily charge tracking (`turretCharges` + `turretResetAt` on habitat doc); auto-block consumes one charge per incoming attack up to TURRET level per day
- [x] **VAULT passive** — reduces defender credit loss by `vaultLevel × 5%` (max 75%) on successful raid
- [x] **Mock users script** — `scripts/seed-mock-users.js` (run once; populates AlphaRaider + BetaOps in playerIndex for RADAR testing)

### Remaining (ops only)
- [x] **Deploy Cloud Function** — deployed `resolveCombat` + `refillSpins` to `us-central1` via `npm run deploy:functions`
- [ ] **Seed mock users** — `node scripts/seed-mock-users.js`

---

## Phase 4: Monetization ✅ (cosmetics complete; IAP/ads pending)

Hard currency, IAP, and rewarded ads. Build the social loop fully before adding monetization pressure.

### Completed
- [x] **IAP Credit Packs** — POCKET / HOARD / VAULT / STAR FORGE (credits); SPIN REFILL; FUEL TANK / SIGNAL ARRAY / BARRIER PACK; COMMANDER PACK / WAR CHEST (store tab, simulated flow)
- [x] **Ad rewards** — +5 SPINS, +500 CR, +1 FUEL, +1 SIGNAL BOOSTER (rewarded ad buttons in store)
- [x] **Cosmetics catalog** — 50 items across 9 categories: reel themes, symbol packs, spin button skins, HUD skins, ambient backgrounds, suit colors, pilot emblems, pilot titles, win celebration animations
- [x] **`CosmeticsService.ts`** — full token maps for all categories; `COSMETIC_CATALOG` with credit/IAP pricing; `BUNDLE_GRANTS` for multi-item packs
- [x] **`useCosmeticsStore.ts`** — Zustand store with AsyncStorage persistence; `buy()` / `equip()` / `isOwned()` actions; bundle grant expansion; free-item whitelist
- [x] **Store tab cosmetics sections** — horizontal FlatList per category; `CosmeticCard` with ACTIVE / EQUIP / CR / IAP contextual button; buy/equip haptics + toast; IAP confirmation modal
- [x] **Live cosmetic wiring** — `ReelDisplay` reads active reel theme + symbol pack; `SpinButton` reads active button skin; `ResourceBar` reads HUD skin + emblem + pilot title; `spin.tsx` reads ambient background

### Remaining
- [ ] **Temporal Crystals** — hard currency (distinct from Credits); earned via IAP or sparingly via gameplay
- [ ] **RevenueCat integration** — real StoreKit/Play Billing for all IAP items
- [ ] **AdMob rewarded ads** — real ad placements replacing simulated ad buttons
- [ ] **Instant build skip** — spend hard currency to complete active build job instantly

---

## Phase 5: Polish & Launch 🔨

- [x] Unit tests — `SlotsEngine` payout math, weight normalization, Rift modifiers, multiline evaluation
- [ ] Integration tests — Zustand store actions, Firestore write/read round-trips
- [x] Onboarding tutorial — first-run overlay: spin → build → deploy drone (3-step modal, AsyncStorage gated)
- [x] Pilot customization — color + accessory picker on Pilot screen; `setAvatarColor` persists to Firestore
- [x] Particle effects — jackpot confetti (`ConfettiEmitter`), screen shake on incoming attacks
- [ ] Push notifications — "your build is complete", "you were raided" (FCM)
- [ ] App Store / Play Store submission

### Also shipped in Phase 5 session
- [x] **Multiline slot machine** — 3×3 reel window; 1/3/5 paylines gated by Outpost Level; `spinRows()` in SlotsEngine; per-cell win highlight colors in ReelDisplay
- [x] **Winning number fix** — outcome banner now shows the fully boosted amount (drone × anomaly + overclock), matching the Ledger
- [x] **Spin button physicality** — aggressive press spring animation + haptic ticks during spinning
- [x] **Win ceremony animations** — JACKPOT burst, multi-line badge, cell highlights
- [x] **Spin history drawer** — swipe-up log of last 20 spins with outcome icons
- [x] **RADAR recent targets** — last 5 scanned players cached on device
- [x] **Ledger receipts** — full breakdown modal per spin (base × drone × anomaly × overclock)
- [x] **Combat math transparency** — modifier display in mini-game shows live power calculation
- [x] **RIFT visual clarity** — tier glyphs + cost preview before activating
- [x] **Base crash fix** — resolved undefined-habitat crash on cold start

---

## System Health

| System | Status | Notes |
|---|---|---|
| SlotsEngine | ✅ Solid | 9 symbols, rift modifiers, signal boost, multiline (1/3/5 paylines), full payout table |
| useGameStore | ✅ Solid | All resources, spin buffs, Firestore sync, reelWindow + activeWinLines |
| useHabitatStore | ✅ Solid | Outpost gate, build timers, Firestore persistence, `getNumActiveLines()` |
| useDroneStore | ✅ Solid | Deploy/tick/expire lifecycle |
| useAnomalyStore | ✅ Solid | Global sync via onSnapshot |
| useEventStore | ✅ Solid | Firestore events subscription, needs CF to write events |
| useAuthStore | ✅ Solid | Player index writes, avatarColor, setAvatarColor |
| useCosmeticsStore | ✅ New | AsyncStorage persistence, buy/equip/bundle, free-item whitelist |
| FirestoreService | ✅ Solid | All collections covered; CF integration pending |
| CosmeticsService | ✅ New | 50-item catalog, all token maps, bundle grants |
| RADAR screen | ✅ Solid | Needs real playerIndex data to populate |
| CombatMiniGame | ✅ Solid | Client-side only; outcomes pending CF |
| EventBanner | ✅ Solid | Fully wired; events pending CF writes |
| Cloud Function | ✅ Deployed | `resolveCombat` + `refillSpins` live in `us-central1`; redeploy via `npm run deploy:functions` |
| TURRET/VAULT passives | ✅ Written | Wired inside resolveCombat CF |
| Security rules | ✅ Complete | playerIndex, events subcollection, combatRequests all covered |
| Mock users | ✅ Written | Run `node scripts/seed-mock-users.js` to populate RADAR targets |
| Unit tests | ✅ New | SlotsEngine: evaluate, spinRows, rift modifiers, signal boost, weight normalization |
| Onboarding | ✅ New | 3-step first-run modal, AsyncStorage gated |
| Pilot customization | ✅ New | Color + accessory picker on Pilot tab |
| Particle effects | ✅ New | ConfettiEmitter (jackpot), screen shake (incoming attack) |
