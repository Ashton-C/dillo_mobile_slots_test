# Reelwright — Progress & Roadmap

**Current Phase:** Phase 5 (Polish & Launch) — closed-testing prep
**Last Updated:** 2026-05-14

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
- [x] **PvP mini-games** — `RouletteGame` (BREACH/INTRUSION outcome) and `BlackjackMiniGame` (EXTRACT/EXTRACTION outcome) replaced the original 3-reel CombatMiniGame; both write `combatRequests` for the Cloud Function to resolve. `CombatMiniGame` is still in the tree as a legacy fallback.
- [x] **SectorMap** — discovery UI replaces the old flat list of nearby targets; players pick a sector, see procedurally placed targets with threat tiers, then launch BREACH or EXTRACT
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

## Phase 4: Monetization ✅ (RC + AdMob wired; sandbox testing pending)

Hard currency, IAP, and rewarded ads. Built the social loop fully before turning monetization pressure on.

### Completed
- [x] **IAP Credit Packs** — POCKET / HOARD / VAULT / STAR FORGE (credits); SPIN REFILL; FUEL TANK / SIGNAL ARRAY / BARRIER PACK; COMMANDER PACK / WAR CHEST
- [x] **Stardust (✦) premium currency** — replaces the flat `reelwright_skip_build` IAP. Build skip costs scale with time remaining (1 ✦/min building, 2 ✦/min outpost). 5-tier IAP ladder (`sd_starter` → `sd_hoard`, $0.99 → $49.99). F2P earn paths: 5 ✦ per JACKPOT roulette result, 10 ✦ per outpost level-up milestone, 1 ✦ per blackjack-extraction win.
- [x] **`SkipBuildModal`** — unified UI for spending Stardust to finish a build instantly; opens from active build job in Habitat / Outpost detail
- [x] **RevenueCat integration** — `IapService` wraps `react-native-purchases` with stub fallback for Expo Go; live `priceString` overrides hardcoded pack prices via `useIapPrices`; Customer Center sheet replaces the old hand-rolled restore button
- [x] **Receipt-validation webhook** — `revenueCatWebhook` in `functions/src/index.ts` is the source of truth for `cr_*` / `sp_*` / `rs_*` / `bd_*` / `sd_*` / cosmetic purchases; `iapTransactions/{id}` idempotency; cosmetic bundle expansion via `arrayUnion` on `users/{uid}.ownedCosmetics`; deployed and verified end-to-end with RC TEST webhook
- [x] **AdMob rewarded ads** — `AdsService` wraps `react-native-google-mobile-ads` with Expo Go fallback (`ADS_AVAILABLE` flag); test IDs in dev, real IDs from `extra.admob` in production; rewarded video powers the store-tab ad cards
- [x] **AdMob interstitials** — wired with frequency cap; trigger on spin-tab blur, configurable
- [x] **Cosmetics catalog** — 50 items across 9 categories: reel themes, symbol packs, spin button skins, HUD skins, ambient backgrounds, suit colors, pilot emblems, pilot titles, win celebration animations
- [x] **`CosmeticsService.ts`** — full token maps for all categories; `COSMETIC_CATALOG` with credit/IAP pricing; `BUNDLE_GRANTS` for multi-item packs
- [x] **`useCosmeticsStore.ts`** — Zustand store with AsyncStorage persistence; `buy()` / `equip()` / `isOwned()` actions; bundle grant expansion; free-item whitelist; remote `ownedCosmetics` sync from Firestore on auth init
- [x] **Store tab** — `CosmeticCategoryGrid` per category; `CosmeticPurchaseModal` with preview; buy/equip haptics + toast; MANAGE PURCHASES launches RC Customer Center
- [x] **Live cosmetic wiring** — `ReelDisplay` reads active reel theme + symbol pack; `SpinButton` reads active button skin; `ResourceBar` reads HUD skin + emblem + pilot title; `spin.tsx` reads ambient background

### Remaining (ops only)
- [ ] First real sandbox purchase end-to-end on iOS (blocked on Apple Developer account)
- [ ] First real sandbox purchase end-to-end on Android (Play Console product registration)
- [ ] App Store Connect IAP product creation (see `MONETIZATION_CHECKLIST.md` § 3)
- [ ] Refund-clawback path on RC `CANCELLATION` webhook event (currently no-op)

---

## Phase 5: Polish & Launch 🔨 (closed testing prep)

- [x] Unit tests — `SlotsEngine` payout math, weight normalization, Rift modifiers, multiline evaluation (37 passing)
- [ ] Integration tests — Zustand store actions, Firestore write/read round-trips
- [x] Onboarding — `OnboardingCarousel` 5-card swipe walkthrough + `OnboardingModal` 3-step task gate (AsyncStorage gated)
- [x] Pilot customization — color + accessory picker on Pilot screen; `setAvatarColor` persists to Firestore
- [x] Particle effects — jackpot confetti (`ConfettiEmitter`), `JackpotBurst`, screen shake on incoming attacks
- [x] **Push notifications** — `NotificationService` registers Expo push tokens; CF `notifyBuildComplete` fires on build-job falling edge; `resolveCombat` sends raid-outcome pushes to defenders (rate-limited by attack cooldown)
- [x] **Daily login streak** — server-validated `claimDailyReward` CF, 7-day reward cycle with weekly milestone, `DailyRewardModal` auto-opens on first foreground after the 22h window
- [x] **Refund clawback** — `revenueCatWebhook` now handles CANCELLATION/REFUND/EXPIRATION; reverses rewards transactionally with abuse cap (`refundedStardustTotal` ≥ 5,000 ✦ flags the account and blocks future stardust grants)
- [x] **Attack cooldown** — defenders can only be raided every 10 minutes; failed attempts refund the breach key
- [x] **Cost-curve rebalance** — building/outpost costs switched from `level^1.4` (max-out in <2 weeks) to geometric `1.9^(level-1)` (~2-3 month grind at OP6 EV). 5-cell evaluator scale bumped (3→2×, 4→4×, 5→6×) so OP10 grid stops paying *less* than OP6
- [x] **Level cap removal** — building/outpost cap raised from 10 to 50; levels 11+ are "prestige" tiers granting +5% credit yield per level (multiplicative)
- [x] **Personalized-ads gating** — `AdsService` now honors the ATT permission state instead of always forcing `requestNonPersonalizedAdsOnly: true`
- [ ] App Store / Play Store submission (see `DEPLOY_CHECKLIST.md`)

### Also shipped in Phase 5 session
- [x] **Multiline slot machine** — 3×3 / 5×5 reel windows; 1/3/5/10 paylines gated by Outpost Level (`getGridConfig`); `spinRows()` in SlotsEngine; per-cell win highlight colors in ReelDisplay
- [x] **Roulette + Blackjack PvP mini-games** — replaced the 3-reel CombatMiniGame for raid resolution; thematically distinct outcomes for BREACH (roulette wheel) vs EXTRACT (blackjack hand)
- [x] **SectorMap discovery** — replaces the old flat target list; pick a sector, see procedurally placed threats, launch raid; `SectorTrailMap` shows traversal history
- [x] **OutpostMap** — animated node-based building layout on the Habitat screen; tap a node to open `BuildingDetailModal` or `OutpostDetailModal`
- [x] **HexFrame / TopBar / IconButton / TooltipPopover** — design system primitives for the cozy-frontier look
- [x] **BuildCompleteBanner** — slide-in completion notice + tap-to-claim flow
- [x] **CombatResolutionChip** — compact result chip on the EventBanner showing power deltas
- [x] **Winning number fix** — outcome banner now shows the fully boosted amount (drone × anomaly + overclock), matching the Ledger
- [x] **Spin button physicality** — aggressive press spring animation + haptic ticks during spinning
- [x] **Win ceremony animations** — JACKPOT burst, multi-line badge, cell highlights
- [x] **Spin history drawer** — `LedgerDrawer` swipe-up log of last 20 spins with outcome icons + full breakdown receipts
- [x] **RADAR recent targets** — last 5 scanned players cached on device
- [x] **Combat math transparency** — modifier display in mini-game shows live power calculation
- [x] **RIFT visual clarity** — tier glyphs + cost preview before activating; dedicated `(tabs)/rift.tsx` route in addition to the spin-screen selector
- [x] **Base crash fix** — resolved undefined-habitat crash on cold start

---

## System Health

| System | Status | Notes |
|---|---|---|
| SlotsEngine | ✅ Solid | 9 symbols, rift modifiers, signal boost, multiline (1/3/5/10 paylines), full payout table |
| useGameStore | ✅ Solid | All resources incl. Stardust, spin buffs, Firestore sync, reelWindow + activeWinLines |
| useHabitatStore | ✅ Solid | Outpost gate, build timers, Firestore persistence, `getNumActiveLines()`, `getGridConfig()` |
| useDroneStore | ✅ Solid | Deploy/tick/expire lifecycle |
| useAnomalyStore | ✅ Solid | Global sync via onSnapshot |
| useEventStore | ✅ Solid | Firestore events subscription; CF writes events on resolve |
| useAuthStore | ✅ Solid | Player index writes, avatar color/accessory, outpost color, cosmetics rehydrate |
| useCosmeticsStore | ✅ Solid | AsyncStorage + Firestore-synced `ownedCosmetics`, buy/equip/bundle, free-item whitelist |
| FirestoreService | ✅ Solid | All collections covered; CF integration live |
| CosmeticsService | ✅ Solid | 50-item catalog, all token maps, bundle grants |
| IapService | ✅ Solid | RevenueCat client wrapper, Customer Center, paywall hooks, Expo Go stub fallback |
| AdsService | ✅ Solid | Rewarded + interstitial, frequency cap, test IDs in dev, Expo Go stub fallback |
| RADAR screen | ✅ Solid | SectorMap + threat tiers; seed mock users for population |
| Roulette / Blackjack | ✅ Solid | Replaced CombatMiniGame for PvP raids; outcomes resolved in CF |
| EventBanner | ✅ Solid | Fully wired with CF event writes; `CombatResolutionChip` for raid results |
| Cloud Functions | ✅ Deployed | `resolveCombat`, `refillSpins`, `revenueCatWebhook` (+ refund clawback), `claimDailyReward`, `notifyBuildComplete`, `seedAnomaly` live in `us-central1`; redeploy via `npm run deploy:functions` |
| Daily reward streak | ✅ New | Server-validated 22h window, 7-day cycle, weekly milestone, abuse-resistant |
| Attack cooldown | ✅ New | 10-minute per-defender cooldown enforced in `resolveCombat`; refunds breach key on hit |
| Push notifications | ✅ New | `expo-notifications` lazy-required for Expo Go safety; Cloud Functions send via Expo's relay; build-complete + raid-outcome pushes |
| Refund clawback | ✅ New | Reverses rewards transactionally; cumulative stardust refund threshold flags the account |
| Cost curve | ✅ Rebalanced | Geometric `1.9^(level-1)` for buildings + outpost; OP10 5-cell payouts bumped so it stops paying less than OP6 |
| Prestige levels | ✅ New | Outpost 11–50 grant +5% credit yield/level via `getOutpostPrestigeMultiplier`; cap raised to `LEVEL_HARD_CAP = 50` |
| TURRET/VAULT passives | ✅ Solid | Wired inside `resolveCombat` CF; daily charge tracking |
| Security rules | ✅ Complete | playerIndex, events subcollection, combatRequests, anomalies/current all covered |
| Mock users | ✅ Written | Run `node scripts/seed-mock-users.js` to populate RADAR targets |
| Unit tests | ✅ Solid | SlotsEngine: evaluate, spinRows, rift modifiers, signal boost, weight normalization (37 passing) |
| Onboarding | ✅ Solid | `OnboardingCarousel` 5-card swipe + `OnboardingModal` 3-step task gate |
| Pilot customization | ✅ Solid | Color + accessory + outpost color picker on Pilot tab |
| Particle effects | ✅ Solid | ConfettiEmitter (jackpot), JackpotBurst, screen shake (incoming attack) |
| Stardust system | ✅ Solid | 5-tier IAP ladder, F2P earn paths, SkipBuildModal for build/outpost skips |
