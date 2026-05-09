# Monetization launch checklist

Step-by-step gate from "client scaffolding shipped" to "ready to push EAS production build". Anything not covered here, ask in the channel before flipping a flag in `app.json`.

## 0. Sanity

- [ ] Run `npm install` (or `bun install` / `pnpm install`) — `react-native-purchases`, `expo-tracking-transparency`, and `expo-build-properties` were pinned in `package.json` but not actually installed in the sandbox where the scaffolding was written.
- [ ] Run `npx expo prebuild --clean` after adjusting plugins — required since this project moved off the managed-only flow when AdMob was added.

All third-party keys flow through environment variables — `app.config.js`
reads them at config-eval time and injects them into `extra` / plugin args.
**Nothing sensitive lives in `app.json`.** Copy `.env.example` to `.env.local`
for dev, and add the same vars as EAS Environment Variables (or Secrets,
for the server-only ones) for cloud builds.

## 1. AdMob

- [x] Create AdMob iOS app, copy **App ID** → `.env.local`: `ADMOB_IOS_APP_ID`
- [x] Create AdMob Android app, copy **App ID** → `.env.local`: `ADMOB_ANDROID_APP_ID`
- [x] Create one **Rewarded** unit per platform → `.env.local`: `ADMOB_REWARDED_IOS` / `ADMOB_REWARDED_ANDROID`
- [x] Create one **Interstitial** unit per platform → `.env.local`: `ADMOB_INTERSTITIAL_IOS` / `ADMOB_INTERSTITIAL_ANDROID`
- [ ] Confirm: `__DEV__` builds will still use `TestIds` even with real keys present (see `AdsService.ts` lines 47-63). *(verify on first EAS dev build)*

## 2. RevenueCat

RevenueCat hands you several different keys — they're **not interchangeable**:

| Key style | Where it lives | Used for |
|---|---|---|
| `appl_…` | `.env.local` → `REVENUECAT_PUBLIC_KEY_IOS` | iOS client SDK |
| `goog_…` | `.env.local` → `REVENUECAT_PUBLIC_KEY_ANDROID` | Android client SDK |
| `sk_…` or `test_…` | Firebase Functions secret `REVENUECAT_SECRET_KEY` | Server-side REST calls (currently unused, kept for future use) |

If you accidentally paste a `sk_…` / `test_…` key into `REVENUECAT_PUBLIC_KEY_*`, the SDK will refuse to configure and you'll be stuck in stub mode. The reverse (a public key in the secret slot) leaks nothing but won't authenticate server calls. **Always copy from "Public app-specific API keys" → the platform row.**

- [x] Sign up at revenuecat.com, create project "Reelwright".
- [~] Add **iOS app** with bundle id `com.reelwright.app`. *Need Apple Developer account, deferred until that's set up.*
- [x] Add **Android app** with package `com.reelwright.app`.
- [~] Copy iOS public SDK key (`appl_…`) → `.env.local`: `REVENUECAT_PUBLIC_KEY_IOS`. *Deferred with iOS app.*
- [x] Copy Android public SDK key (`goog_…`) → `.env.local`: `REVENUECAT_PUBLIC_KEY_ANDROID`
- [x] Copy the **secret API key** (`sk_…` / `test_…`) → Firebase Functions secret:
  ```
  firebase functions:secrets:set REVENUECAT_SECRET_KEY
  ```
- [x] Generate your own webhook auth token (`openssl rand -hex 32`)
      → Firebase Functions secret AND the RC webhook config:
  ```
  firebase functions:secrets:set REVENUECAT_WEBHOOK_AUTH
  ```
  Same value lives in RC → Integrations → Webhooks → Authorization
  header, prefixed with `Bearer `.

## 3. App Store Connect — IAP products

Create one **Consumable** per ID below. Must match `StoreService.PACKS` exactly.

- [ ] `cr_pocket` — $0.99 — POCKET (1,000 CR)
- [ ] `cr_hoard` — $4.99 — HOARD (5,000 CR)
- [ ] `cr_vault` — $19.99 — VAULT (25,000 CR)
- [ ] `cr_forge` — $49.99 — STAR FORGE (100,000 CR)
- [ ] `sp_refill` — $0.99 — Spin refill
- [ ] `rs_fuel5` — $1.99 — +5 fuel
- [ ] `rs_boost5` — $1.99 — +5 boost
- [ ] `rs_shield5` — $1.99 — +5 shields
- [ ] `bd_starter` — $4.99 — Commander pack
- [ ] `bd_war` — $9.99 — War chest
- [ ] `reelwright_skip_build` — $0.99 — Instant build skip (used by `SkipBuildModal`)
- [ ] (Optional, defer to Phase 4b) Cosmetic IAPs from `COSMETICS_CATALOG` with `iapPrice` set

## 4. Google Play Console — same products

Mirror the iOS list above as **In-app products → Managed products → Consumable**. Same IDs, same prices.

## 5. Sandbox testers

- [ ] App Store Connect → Users and Access → Sandbox → create at least one tester
- [ ] Google Play Console → Setup → License testing → add the Google account you'll test with

## 6. RevenueCat product mapping

- [ ] Inside RevenueCat → Products: import each product ID created above (one entry per platform pair).
- [ ] Group them into a single Offering called `default` so `Purchases.getOfferings()` returns them.

## 7. Cloud Function: receipt-validation webhook (server-side authority for credits/spins/resources/cosmetics)

The client only grants paid rewards in **stub mode** (Expo Go / no RC keys).
In production the webhook (`revenueCatWebhook` in `functions/src/index.ts`)
is the source of truth for `cr_*` / `sp_*` / `rs_*` / `bd_*` purchases AND
for cosmetic IAPs and `bundle_*` cosmetic-bundle SKUs (which expand via
`COSMETIC_BUNDLE_GRANTS` into multiple `ownedCosmetics` entries plus optional
bonus credits).

- [x] `revenueCatWebhook` HTTPS function with `iapTransactions/{id}` idempotency,
      bundle expansion, and cosmetic `arrayUnion` grants on `users/{uid}.ownedCosmetics`.
      Already committed — see `functions/src/index.ts`.
- [x] `firebase deploy --only functions` — webhook is live on the
      `sovereign-slots-2b109` project.
- [x] In RevenueCat → Project Settings → Integrations → Webhooks:
      URL + `Bearer <REVENUECAT_WEBHOOK_AUTH>` configured. **TEST event
      verified end-to-end** (`revenueCatWebhook: skip non-grant event TEST → 200`
      visible in `firebase functions:log`).
- [ ] First **real** sandbox purchase still pending (depends on Play Console
      product registration in section 4 + sandbox tester in section 5).

`reelwright_skip_build` is intentionally **not** routed through the webhook —
it's a low-stakes purchase applied client-side after `iapService.purchase()`
resolves successfully. The worst-case abuse is a free build skip, which we're
willing to live with for now.

**Pricing surface.** All store-screen prices, cosmetic chip prices, and the
SpinRefillModal price use the live localized priceString from RC at runtime
(`useIapPrices` hook). The hardcoded prices in `StoreService.PACKS[].price`
and `COSMETICS_CATALOG[].iapPrice` are fallbacks only — RC values override
when configured. No need to edit either when you change a price in App Store
Connect / Play Console; the client will pick it up on next launch.

### Firestore infra (rules + indexes)

- [x] `firestore.rules` deployed (`firebase deploy --only firestore:rules`).
      Locks `users/{uid}` to owner reads/writes, makes `anomalies/current`
      server-only, allows `combatRequests` create only by the matching
      attacker. The Cloud Functions webhook + combat resolver bypass
      these via the Admin SDK (intentional).
- [x] `firestore.indexes.json` deployed (`firebase deploy --only firestore:indexes`)
      with the field order Firestore's planner asked for: `spinRefillStart →
      spinsRemaining → updatedAt`. See commit `d47be37` for the field-order
      fix that unblocked `refillSpins`.

## 8. EAS build

- [ ] `eas build:configure` if not already done.
- [ ] In `eas.json`, ensure your `production` profile has `"distribution": "store"`.
- [ ] First build: `eas build -p ios --profile production` and `eas build -p android --profile production`.
- [ ] First time only: AdMob requires `useFrameworks: static` on iOS — already pinned in `app.json -> plugins.expo-build-properties.ios.useFrameworks`. If iOS build fails on Pods linking, this is the lever.

## 9. Testing flow

| Environment | Ads | IAP |
|---|---|---|
| Expo Go | Stubbed (rewarded resolves instantly) | Stubbed (`stubbed: true` in result; client grants locally) |
| EAS dev client | Real test ad fill | RC sandbox if signed in to TestFlight/Internal track w/ a sandbox tester |
| TestFlight / Play Internal | Real fill | Real receipts via sandbox tester (no charge) |
| App Store / Play Store production | Real fill, real eCPM | Real money |

- [ ] Watch one rewarded ad in EAS dev build → reward applied.
- [ ] Trigger one interstitial via spin-tab blur → ad displays.
- [ ] Trigger another interstitial within 4 minutes → blocked by frequency cap (verify in console log).
- [ ] One sandbox purchase end-to-end on iOS → credits arrive in Firestore (via webhook).
- [ ] Same on Android.
- [ ] Restore Purchases button on Store tab → reports correct count for sandbox tester.
- [ ] On iOS, ATT prompt appears once on first launch.
- [ ] Spin to 0 → SpinRefillModal opens; "Wait" countdown matches `spinRefillStart`.
- [ ] Start a build, open the building → "FINISH NOW" button appears.

## 10. App Store / Play submission

- [ ] App Store Review Notes: include sandbox tester credentials and test plan ("Tap STORE → POCKET → confirm IAP → expect 1,000 credits added").
- [ ] Privacy nutrition labels: declare ads + analytics + IAP per iOS.
- [ ] Google Play Data Safety: same.

## 11. RevenueCat prebuilt UI (Customer Center + Paywall)

The app pulls in `react-native-purchases-ui` for two prebuilt screens.

**Customer Center.** Replaces the old hand-rolled "RESTORE PURCHASES" button.
The Store screen now ships a "MANAGE PURCHASES" button that calls
`iapService.presentCustomerCenter()` — handles restore, refund requests, manage
subscriptions, and the missing-purchase flow Apple requires. Falls back to
plain `restore()` when the UI module isn't loaded (Expo Go).

- [ ] In RC dashboard → Customer Center → enable for the project.
- [ ] Customize the Customer Center theme (logo, support email, FAQ entries) — RC's defaults are fine but a quick branding pass costs nothing.
- [ ] On a TestFlight / Internal Testing build: tap MANAGE PURCHASES, verify
      the native sheet appears with your sandbox purchases listed and a
      working "Request a refund" entry on iOS.

**Paywall.** Hooked up via `iapService.presentPaywall({ offeringId })` and
`iapService.presentPaywallIfNeeded(entitlementId)`. **Not currently triggered
anywhere in the app** because Reelwright is consumables-only and RC's paywall
UI is optimised for subscription upsells. When you add a "Reelwright Pro"
tier (battle pass, ad-free toggle, perma-2x credits, etc.), wire it like:

```ts
// somewhere reachable from a "Go Pro" CTA:
const result = await iapService.presentPaywallIfNeeded('pro');
if (result === 'PURCHASED' || result === 'RESTORED') {
  // entitlement is now active — read via iapService.hasActiveEntitlement('pro')
}
```

The `customerInfo` listener (`iapService.onCustomerInfo`) will fire as soon
as the entitlement state changes, so any feature gate that subscribes to it
unlocks immediately — no manual refresh.

- [ ] (Deferred) Decide on the subscription product / entitlement name.
- [ ] (Deferred) Configure the Paywall template in RC → Paywalls → Editor.
- [ ] (Deferred) Wire the trigger CTA.

## 12. Stardust (premium build-skip currency)

The flat `reelwright_skip_build` IAP is gone — replaced by **Stardust** (✦),
a soft currency that scales with build duration. F2P players earn it via
jackpots, outpost level-ups, and blackjack-extraction wins; whales buy
packs in a 5-tier IAP ladder.

**Earn rate:**
- 5 ✦ per JACKPOT spin (≈8% of JACKPOT-tier roulette wheel)
- 10 ✦ per outpost level-up (one-time milestone)
- 1 ✦ per blackjack-extraction win

**Spend formula:**
- Building skip: `ceil(msRemaining / 60_000) × 1` ✦
- Outpost skip: `ceil(msRemaining / 60_000) × 2` ✦

**Worked examples:** Lv 5 building (~3h) = 180 ✦. Lv 9 outpost (~24h) = 2880 ✦.
Lv 10 outpost (~72h) = 8640 ✦.

### Pack ladder

Register each as **Consumable** in Play Console (and App Store Connect
when iOS comes online):

- [ ] `sd_starter` — $0.99 — 100 ✦
- [ ] `sd_handful` — $4.99 — 600 ✦  (+20% bonus)
- [ ] `sd_jar` — $9.99 — 1,500 ✦  (+50% bonus)
- [ ] `sd_chest` — $24.99 — 4,000 ✦  (+60% bonus, mark featured)
- [ ] `sd_hoard` — $49.99 — 10,000 ✦  (+100% bonus)

After registration:

- [ ] Import all 5 sd_* products into RevenueCat → Products.
- [ ] Add them to the existing `default` Offering so
      `Purchases.getOfferings()` includes them.
- [ ] **Drop `reelwright_skip_build`** from Play Console + RC (no-op if
      you hadn't created it). The webhook map already removed the entry.

The webhook (`functions/src/index.ts:PACK_REWARDS`) and client
(`StoreService.PACKS`) both have the 5 sd_* entries with matching
rewards — no further code work needed once you finish the dashboard
registration.

## Open scope for later

- **Subscriptions** — not implemented. RC supports them; we'd add a "battle pass" tier post-launch.
- **Refund handling** — RC has a `CANCELLATION` webhook event. The current scaffolding doesn't claw back already-granted credits or stardust on refund. Add this before getting players who'll abuse it.
- **Daily-spin bonus** — deferred from v1 stardust scope. Build a proper daily-rewards screen with streak tracking in Phase 4b.
- **Cosmetic IAPs** — currently part of the catalog but not promoted to v1 store flow. Defer to Phase 4b.
