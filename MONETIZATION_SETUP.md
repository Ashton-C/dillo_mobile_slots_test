# Ad Integration Setup — Reelwright

The codebase is now wired up for Google AdMob rewarded video ads. The wiring
is **safe to ship as-is** — without real account credentials it falls back
to test ads (which always serve, never charge), and inside Expo Go it falls
back to the original "fake watching ad" modal flow so your dev experience
isn't blocked.

This document is the cookbook for going from "scaffolded" to "earning real
revenue."

---

## What's already done in code

| File | What it does |
|---|---|
| `src/services/AdsService.ts` | Wraps `react-native-google-mobile-ads` with graceful Expo Go fallback. Exposes `init()`, `showRewardedAd()`, `showInterstitialAd()`. Uses `AdEventType.ERROR` (the v16 SDK split error events off `RewardedAdEventType`). |
| `app/_layout.tsx` | Calls `adsService.init()` at app boot. |
| `app/(tabs)/store.tsx` | Watch-an-Ad cards call `adsService.showRewardedAd()`; reward grants on `rewarded: true`. Falls back to fake-ad modal when `ADS_AVAILABLE` is false. |
| `app/(tabs)/_layout.tsx` | Dev tab is hidden (`tabBarButton: () => null`). The `/dev` route still exists if you need it for debugging. |
| `app.config.js` | AdMob plugin registered with test App IDs as fallbacks. `extra.admob` reads ad-unit IDs from `ADMOB_REWARDED_*` and `ADMOB_INTERSTITIAL_*` env vars. |
| `package.json` | `react-native-google-mobile-ads 16.3.3` pinned (SDK 55-compatible). |

> **Important:** AdMob requires a **development build** (or production build).
> Native modules don't run in Expo Go. Run `npx expo prebuild` then build via
> EAS — see the deploy checklist below.

---

## Accounts you need to create

### 1. Google AdMob (required for ads)

1. Go to <https://admob.google.com/> and sign in with a Google account.
2. **Create app** → Android → enter app name "Reelwright" → mark as
   not yet published. Repeat for iOS.
3. After each app is created, AdMob assigns it an **App ID** in the form
   `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`. Copy both (Android + iOS).
4. Inside each app, click **Ad units** → **Add ad unit** → choose
   **Rewarded** → name it "Watch-an-Ad reward" → save. AdMob assigns each
   unit an **Ad Unit ID** in the form
   `ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ`. Copy both (Android + iOS).
5. Link each app to a payment profile in **Payments** before launching to
   real users.

### 2. (Eventually) AdMob mediation networks

Optional. Once revenue is flowing, mediating with Meta Audience Network,
AppLovin, or Unity Ads typically lifts eCPM by 20–40%. Ignore until you
have at least 10k DAU.

---

## Filling in the credentials

### `app.json`

Replace the test App IDs with the real ones from AdMob:

```jsonc
"plugins": [
  ...,
  [
    "react-native-google-mobile-ads",
    {
      "androidAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY",   // your real Android App ID
      "iosAppId":     "ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY"    // your real iOS App ID
    }
  ]
]
```

And the rewarded unit IDs:

```jsonc
"extra": {
  "admob": {
    "rewardedAndroid": "ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ",
    "rewardedIos":     "ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ"
  }
}
```

`AdsService.ts` reads these IDs via `Constants.expoConfig?.extra.admob`.
In **dev builds** it always uses Google's test IDs (so you don't burn
impressions during development); in **production builds** it uses the real
IDs above.

### Re-prebuild after changing native config

```bash
npx expo prebuild --clean
```

This regenerates the native `ios/` and `android/` folders with the new
AdMob plugin config baked in. Required any time you change the plugins
array or App IDs.

---

## iOS App Tracking Transparency (ATT)

iOS 14.5+ requires a permission prompt before showing personalized ads.
The current `AdsService` requests **non-personalized ads only** so the
prompt is not strictly required, but for higher eCPMs you should add it.

Add to `app.json`:

```jsonc
"ios": {
  ...,
  "infoPlist": {
    "NSUserTrackingUsageDescription": "We use this to show you ads relevant to your interests, which keeps the game free."
  }
}
```

Then install and call `expo-tracking-transparency` once on first launch.
(Not yet wired — add when you go after personalized inventory.)

---

## Verifying the integration

1. Run `npm install` to pull `react-native-google-mobile-ads`.
2. `npx expo prebuild --clean` to regenerate native folders.
3. `npx expo run:android` (or `run:ios`) to build a dev client.
4. Open the **STORE** tab → "Watch an Ad" section → tap a card. You should
   see Google's **test rewarded ad** play (it says "Test mode" across the
   top). On completion, the resource reward grants and the card cooldowns.
5. The Expo Go app will still show the fake-ad modal (because
   `ADS_AVAILABLE` is `false` there). That's expected.

---

## Optional next-step monetization

### Interstitial ads (scaffold ready)

`adsService.showInterstitialAd()` is wired and pulls the unit ID from
`process.env.ADMOB_INTERSTITIAL_ANDROID` / `..._IOS`. To use:

```ts
import { adsService } from '@/services/AdsService';
await adsService.showInterstitialAd();
```

**Don't show on every action** — frequency-cap to avoid policy violations
and burnout. Good triggers:
- After a sector-victory screen on the Rift map
- On the second app open of the day
- When dismissing a major modal (build-complete, level-up)

Add the env vars to `.env.local` and `eas env:push` before they'll fire
real ads. Without them, the function silently returns `{ shown: false }`.

### iOS App Tracking Transparency (already in `app.json`)

`NSUserTrackingUsageDescription` is set. When you're ready for personalized
ads (higher eCPM), install the prompt:

```bash
npx expo install expo-tracking-transparency
```

Call once in `app/_layout.tsx`:
```ts
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
await requestTrackingPermissionsAsync();
```

Then flip `requestNonPersonalizedAdsOnly: false` in `AdsService.ts`.

### In-app purchases

Currently the store **simulates** all purchases — `confirmPurchase()` in
`store.tsx` grants resources directly. To replace with real IAP:

1. **RevenueCat** (recommended for cross-platform): `npm install react-native-purchases`. SKUs in their dashboard, then `Purchases.purchaseProduct(sku)` returns a receipt. Cleanest receipt validation story.
2. **expo-iap** (lighter, native-only): `npx expo install expo-iap`. SKUs in App Store Connect / Google Play Console. You implement receipt validation server-side.

Either way, `confirmPurchase()` becomes:
```ts
const receipt = await Purchases.purchaseProduct(pendingPack.sku);
if (receipt.transactionIdentifier) {
  grantResources(pendingPack.rewards);
}
```

### Rewarded interstitial for spin-refill

When `spinsRemaining === 0`, surface a "WATCH AD FOR 5 SPINS" CTA in the
spin screen header. Reuses `showRewardedAd()` — point the on-success
handler at `grantResources({ spinRefill: true })` (or a partial refill).

### Push notifications

`expo-notifications` + a Cloud Function on the `combatRequests` collection.
Out of scope until Phase 4 — see `progress.md`.

---

## Mediation networks (lifts eCPM 20–40%)

Once you're past 10k DAU, add mediation adapters in AdMob Console
(**Mediation → Create mediation group**). Common adapters:

| Network | Adapter SDK | Setup difficulty |
|---|---|---|
| Meta Audience Network | `react-native-google-mobile-ads-mediation-meta` | Low — register Facebook app, add ID to AdMob |
| AppLovin | `react-native-google-mobile-ads-mediation-applovin` | Low — single SDK key |
| Unity Ads | `react-native-google-mobile-ads-mediation-unity` | Low — Unity Game ID + Placement ID |
| Vungle / Liftoff | `react-native-google-mobile-ads-mediation-vungle` | Medium — separate dashboard |
| Pangle (TikTok) | `react-native-google-mobile-ads-mediation-pangle` | Medium — high CPM in APAC |

Each adapter is a separate `npm install` + `npx expo prebuild --clean` +
fresh EAS build. Add them one at a time and verify ad fill in the
**AdMob Reports** tab before adding the next one.

> **Don't add adapters early.** Below ~5k DAU the additional ad latency
> outweighs the eCPM lift, and the AdMob console mediation auctions need
> volume to optimize.
