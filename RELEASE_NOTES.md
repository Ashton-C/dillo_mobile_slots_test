# Sovereign Slots — Release Notes

## v0.1 — Pre-monetization Cut

**Status:** feature-complete for first soft-launch test.
**Date:** 2026-05-04
**Branch:** `release/v0.1`

This is the last build before ad integration and store packaging. Everything in
this version is gameplay; nothing is monetized yet.

---

### What ships in v0.1

**Core loop**
- Weighted slot engine, 9 symbols, jackpot/triple/pair payouts
- 1, 3, or 5 paylines (gated by Outpost level)
- Spin energy: 50 cap, 1/5min refill, persistent across sessions
- Multi-resource win readout (CR / SHIELD / BREACH / etc.) on a fixed
  cockpit-style payout panel
- Per-cell win flash + scale on landing symbols
- Sequential reel stops with overshoot spring

**Strategic layer**
- 4 Temporal Rift tiers — shift symbol weights, cost CR per spin
  (T1 = +8 CREDIT_SMALL, T2 = +12 CREDIT_MEDIUM, T3 = +20 CREDIT_LARGE)
- Signal Boost (×1.5 credit weights) and Overclock (flat CR bonus)
  spin buffs, both consumable
- 4 Drone mercenary types with stacking effects (SENTINEL / SCRAMBLER /
  HARVESTER / RAIDER)
- Global Space Anomalies (4-hour rotation) modifying credit yield

**Outpost (Habitat)**
- Full-screen isometric map replacing the old card list
- 7 nodes (OUTPOST + 6 buildings), tappable with detail modals
- Build queue with active job pulsing ring + countdown
- Outpost-level gate enforced client-side and on resource cost
- Hangar modal opens the Drone Marketplace inline

**RADAR (PvP)**
- Sector scan with target list
- Combat insta-stop mini-game (skill layer over RNG)
- Roulette: 3 bet tiers (EVEN / SECTOR / JACKPOT) with visible CR rewards
  and randomized ball deceleration

**Rift Map**
- Sector trail with isometric foreshortening on the path lines
- Vertical pole + ship beacon over the current node
- Symbol-glyph tier descriptions (no name strings)

**Pilot screen**
- Customizable PilotAvatar (de-armadilloed; generic helmet vent)
- Lifetime stats grid: spins, jackpots, CR earned, breaches, extractions,
  raids taken
- Combat log
- Title cosmetic display

**Store**
- Cosmetic categories with real previews per category (mini reels, glyph
  rows, avatar swatches, gradient bg cards, etc.)
- Free Watch-an-Ad slots (2 random rewards, refreshable) — *placeholder
  UI only; no ad SDK wired yet*
- Cosmetic bundles, credit packs, spin refills, resource packs

**Ledger**
- Spin receipts with 3×3 reel snapshot + winning-cell highlights
- Modifier breakdown formula (e.g. `50 × 1.5 (BOOST) + 700 (OC) = 775 CR`)
- Combat log integration

**Cosmetics catalog** (10 categories)
- Reel themes, symbol packs, suit colors, emblems, titles, spin buttons,
  backgrounds, HUD skins, win celebrations, reel frames
- Active item per category persists across sessions
- One-time migration: `sym_dillo` → `sym_squad`

**Backend**
- Firebase Auth (anonymous)
- Firestore: users, habitats, anomalies, playerIndex, events, combatRequests
- Cloud Function for combat resolution (Phase 3 complete)

---

### Explicitly NOT in v0.1

- **Ad integration.** Watch-an-Ad cards are static placeholders. No AdMob,
  Unity Ads, or AppLovin SDK is wired up.
- **In-app purchases.** Credit packs and bundles are UI-only — no Stripe,
  RevenueCat, or platform IAP integration.
- **Push notifications.** No FCM/APNS hookup.
- **Analytics.** No Firebase Analytics, Amplitude, or Mixpanel events.
- **Crash reporting.** No Sentry/Crashlytics.
- **Store listings.** No App Store Connect or Google Play Console assets.

These are tracked for v0.2.

---

### Known issues carried into v0.1

- `__tests__/SlotsEngine.test.ts` requires `@types/jest` (pre-existing)
- `firebase.ts` has a `getReactNativePersistence` export typing miss
  (pre-existing, runtime-OK)
- RADAR target placement renders enemies at orthogonal angles relative to
  the player — visual polish, not a gameplay bug
- Sector trail map is iso-projected but not yet a true hex grid

---

### Tech stack at v0.1

| Layer | Version |
|---|---|
| React Native + Expo | Expo 51 |
| State | Zustand + React Query |
| Animations | Reanimated ~3.10 |
| Backend | Firebase Auth + Firestore + Cloud Functions |
| Type safety | TypeScript strict + Zod |

---

### Next up (v0.2 working set)

- RADAR enemy positioning (organic angles, not orthogonal)
- Sector trail map: true hex grid + 3D-ish isometric render
- Ad SDK integration (rewarded video for Watch-an-Ad cards)
- Deploy pipeline: Android (Play Store) + iOS (TestFlight)
