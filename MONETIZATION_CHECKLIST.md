# Monetization launch checklist

Step-by-step gate from "client scaffolding shipped" to "ready to push EAS production build". Anything not covered here, ask in the channel before flipping a flag in `app.json`.

## 0. Sanity

- [ ] Run `npm install` (or `bun install` / `pnpm install`) — `react-native-purchases`, `expo-tracking-transparency`, and `expo-build-properties` were pinned in `package.json` but not actually installed in the sandbox where the scaffolding was written.
- [ ] Run `npx expo prebuild --clean` after adjusting plugins — required since this project moved off the managed-only flow when AdMob was added.

## 1. AdMob

- [ ] Create AdMob iOS app, copy **App ID** → `app.json -> plugins[react-native-google-mobile-ads].iosAppId`
- [ ] Create AdMob Android app, copy **App ID** → `app.json -> plugins[react-native-google-mobile-ads].androidAppId`
- [ ] Create one **Rewarded** unit per platform → `app.json -> extra.admob.rewardedIos / rewardedAndroid`
- [ ] Create one **Interstitial** unit per platform → `app.json -> extra.admob.interstitialIos / interstitialAndroid`
- [ ] Confirm: `__DEV__` builds will still use `TestIds` even with real keys present (see `AdsService.ts` lines 47-63).

## 2. RevenueCat

- [ ] Sign up at revenuecat.com, create project "Reelwright".
- [ ] Add **iOS app** with bundle id `com.reelwright.app`.
- [ ] Add **Android app** with package `com.reelwright.app`.
- [ ] Copy iOS public SDK key → `app.json -> extra.revenueCat.publicKeyIos`.
- [ ] Copy Android public SDK key → `app.json -> extra.revenueCat.publicKeyAndroid`.
- [ ] Copy the **secret API key** (server side) and store as a Firebase Functions secret:
  ```
  firebase functions:secrets:set REVENUECAT_SECRET_KEY
  ```

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

## 7. Cloud Function: receipt-validation webhook (server-side authority for credits/spins/resources)

The client only grants rewards in **stub mode** (Expo Go / no RC keys). In production the webhook is the source of truth for `cr_*` / `sp_*` / `rs_*` / `bd_*` purchases.

- [ ] Add `revenueCatWebhook` HTTPS function to `functions/src/index.ts`. Stub planned but not yet committed — ping if you want me to write it next.
- [ ] Webhook reads `event.product_id`, looks up `PackReward` from a server-side copy of `PACKS`, applies to `users/{appUserID}` via `runTransaction`.
- [ ] Idempotency: track `transactionId` in a `iapTransactions/{id}` doc; reject duplicates.
- [ ] `firebase deploy --only functions` after secret is set.
- [ ] In RevenueCat → Project Settings → Integrations → Webhooks, point the URL at the deployed function. Test with the "Send test event" button.

`reelwright_skip_build` is intentionally **not** routed through the webhook — it's a low-stakes purchase applied client-side after `iapService.purchase()` resolves successfully. If you want it server-validated too, add it to the webhook map.

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

## Open scope for later

- **Subscriptions** — not implemented. RC supports them; we'd add a "battle pass" tier post-launch.
- **Refund handling** — RC has a `CANCELLATION` webhook event. The current scaffolding doesn't claw back already-granted credits on refund. Add this before getting players who'll abuse it.
- **Cosmetic IAPs** — currently part of the catalog but not routed through the webhook map. Defer to Phase 4b unless you want them in v1.
- **Bundle grants** — `BUNDLE_GRANTS` table maps bundles to multiple cosmetics + bonus credits. The webhook needs to expand a bundle purchase into all its grants atomically.
