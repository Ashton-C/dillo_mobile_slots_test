# Ad Integration Setup — Sovereign Slots

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
| `src/services/AdsService.ts` | Wraps `react-native-google-mobile-ads` with graceful Expo Go fallback. Exposes `init()` and `showRewardedAd()`. |
| `app/_layout.tsx` | Calls `adsService.init()` at app boot. |
| `app/(tabs)/store.tsx` | Watch-an-Ad cards now call `adsService.showRewardedAd()`; reward grants on `rewarded: true`. |
| `app.json` | `react-native-google-mobile-ads` config plugin registered with Google's **test app IDs** as placeholders. `extra.admob.rewardedAndroid` / `extra.admob.rewardedIos` are empty strings — fill these in for production. |
| `package.json` | `react-native-google-mobile-ads ^14.2.0` listed as a dependency. Run `npm install`. |

> **Important:** AdMob requires a **development build** (or production build).
> Native modules don't run in Expo Go. Run `npx expo prebuild` then build via
> EAS — see the deploy checklist below.

---

## Accounts you need to create

### 1. Google AdMob (required for ads)

1. Go to <https://admob.google.com/> and sign in with a Google account.
2. **Create app** → Android → enter app name "Sovereign Slots" → mark as
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

These are *not* wired. Add them after ads are stable.

- **In-app purchases** for credit packs and bundles → `expo-iap` or
  RevenueCat. The store currently grants resources directly when the
  purchase modal confirms; replace with a real receipt-validated flow.
- **Interstitial ads** between sectors (low frequency) — quick win for
  +15% eCPM.
- **Rewarded interstitial** for the spin-energy refill modal — players
  who run out of spins are highly motivated to watch one ad.
- **Push notifications** (FCM) — Expo Notifications + a Cloud Function
  trigger on combat events.
