# Deploy Checklist — iOS & Android

A from-zero checklist for shipping Sovereign Slots to the App Store and
Google Play. Plan a full week the first time; subsequent releases take a
few hours.

---

## Phase 0 — Accounts (do this first; some take days)

| Account | Cost | Lead time | What it unlocks |
|---|---|---|---|
| **Apple Developer Program** | $99/year | 24–48h after Apple verifies your identity | Required to ship to TestFlight or the App Store. |
| **Google Play Developer** | $25 one-time | 1–3 days for identity verification | Required to ship to Internal Testing or Play Store. |
| **Expo / EAS account** | Free tier OK; paid Production starts at $19/mo | Instant | Cloud builds for iOS/Android without owning a Mac (for Android) or doing local Xcode builds. |
| **Google AdMob** | Free | Instant | See `MONETIZATION_SETUP.md`. |
| **Firebase project** | Free tier | Already done | Hosts auth + firestore + cloud functions. |

> You can build for Android on any OS via EAS. Building for iOS without a
> Mac requires EAS Build (cloud Mac infra). Local builds need macOS + Xcode.

---

## Phase 1 — One-time project setup

```bash
# Install EAS CLI
npm install -g eas-cli

# Log in
eas login

# Initialise EAS in this repo (creates eas.json)
eas build:configure
```

Verify `eas.json` has three profiles (development, preview, production).
The default scaffold is fine; you can tune later.

Bump the app version in `app.json` before any prod build:

```jsonc
"version": "0.2.0",
"ios":     { "buildNumber": "1" },
"android": { "versionCode":  1 }
```

`buildNumber` and `versionCode` must increment **every** time you submit a
build to the stores, even if the user-facing `version` stays the same.

---

## Phase 2 — Native config sanity (every release)

The app uses native modules (Reanimated, gesture-handler, AdMob, etc.).
After **any** plugin or native config change in `app.json`, run:

```bash
npx expo prebuild --clean
```

This regenerates `ios/` and `android/`. Commit the regenerated folders if
you're using the bare workflow; otherwise leave them gitignored and let
EAS regenerate them on every build.

---

## Phase 3 — iOS submission

### 3a. App Store Connect setup (one-time)

1. <https://appstoreconnect.apple.com> → **My Apps** → **+** → **New App**.
2. Bundle ID: `com.sovereignslots.app` (must match `app.json` → `ios.bundleIdentifier`).
3. SKU: any unique string (e.g. `sovereign-slots-001`).
4. Fill **App Information**: subtitle, primary category (Games > Casino),
   age rating (17+ for simulated gambling).
5. **Pricing**: Free.
6. **App Privacy**: declare data collection (Firebase Auth UID, AdMob
   advertising identifier). Apple's questionnaire walks you through it.
7. **Encryption**: declare standard encryption only (HTTPS = "Yes, exempt").

### 3b. Build + submit

```bash
# Build for TestFlight
eas build --platform ios --profile production

# Wait ~20 min, then submit the resulting .ipa
eas submit --platform ios --latest
```

EAS handles uploading to App Store Connect. Once Apple processes the build
(~10 min), it appears in **TestFlight** for internal testers.

### 3c. App Store review

After internal testing, click **Submit for Review** in App Store Connect.
Apple typically responds in 24–48h. Common rejection reasons for casino-
style games:

- Missing age gate (we have 17+ rating; ensure no underage flow exists)
- Real-money gambling (we have none — simulated currency only)
- Privacy policy URL not provided (fill in before submission)

You'll need a **Privacy Policy URL** (host on a free service like Vercel
or GitHub Pages) and a **Support URL**. Even a one-page site is enough.

---

## Phase 4 — Android submission

### 4a. Google Play Console setup (one-time)

1. <https://play.google.com/console> → **Create app**.
2. App name: "Sovereign Slots". Package: `com.sovereignslots.app`.
3. **App category**: Casino (Casual). Target age: 18+.
4. **Content rating** → fill questionnaire (mark "simulated gambling").
5. **Data safety** → declare Firebase + AdMob as above.
6. **Pricing & distribution**: Free, all eligible countries, contains ads.
7. **Privacy Policy URL**: same as iOS.

### 4b. Build + submit

```bash
# Build the AAB
eas build --platform android --profile production

# Submit to Internal Testing
eas submit --platform android --latest --track internal
```

EAS uses a Google Play service account (it walks you through generating
one the first time). The build lands in **Internal Testing** within
minutes — no Google review for that track.

### 4c. Promote through tracks

Internal Testing → Closed Testing (Alpha) → Open Testing (Beta) → Production.
Each promotion is a one-click action in the Play Console. Production
review takes 2–7 days the first time, then usually <24h for subsequent
releases.

---

## Phase 5 — Pre-flight checklist (run every release)

Copy this section, work through it the day before submission.

- [ ] `npx tsc --noEmit` zero new errors
- [ ] `npx expo prebuild --clean` runs without error
- [ ] App version bumped in `app.json` (`version` + `buildNumber` + `versionCode`)
- [ ] AdMob real App IDs in `app.json` (not test IDs) for production
- [ ] AdMob real Ad Unit IDs in `app.json` `extra.admob.*`
- [ ] Firebase project config in `src/config/firebase.ts` is the **prod** project, not dev
- [ ] Cloud Functions deployed to prod project (`firebase deploy --only functions`)
- [ ] Firestore security rules tightened (no wildcard reads)
- [ ] Privacy Policy URL is reachable
- [ ] Support URL is reachable
- [ ] Screenshots updated (5 per platform, current UI)
- [ ] App icon and splash render correctly on a device
- [ ] Fresh-install flow works (delete app, reinstall, complete onboarding)
- [ ] Backup recovery flow works (sign in on second device, see saved progress)
- [ ] Tested on at least one low-end device (e.g. Pixel 4a, iPhone SE) for performance

---

## Phase 6 — Post-launch monitoring

Wire these before launch if not already:

- **Crashlytics** (Firebase) — `expo install @react-native-firebase/crashlytics`
- **Analytics** — Firebase Analytics, or Amplitude for funnels
- **Performance Monitoring** — Firebase Performance
- **AdMob mediation reports** — track eCPM by geography

The first 72 hours after a launch are when serious bugs surface. Have a
rollback plan: a hotfix version ready to push, plus the EAS Update channel
configured so you can ship JS-only fixes without a new store review.

---

## Common failure modes (read these BEFORE your first submit)

- **iOS: "Missing Push Notification Entitlement"** — we don't use push
  yet; you can ignore. If the warning persists, remove `aps-environment`
  from the entitlements file (`expo prebuild --clean` regenerates clean
  entitlements).
- **Android: "Your app uses sensitive permissions"** — AdMob requires
  `AD_ID` permission. This is auto-added by the config plugin. Disclose
  it in the **Data safety** form.
- **AdMob "no fill"** — fresh AdMob accounts have low fill rate for
  ~24h. Use test IDs during dev; real ads start serving 1–2 days after
  the first real impression.
- **EAS build fails with "Provisioning profile not found"** — let EAS
  manage credentials. Choose "Yes" when it asks "Set up automatic
  credential management?".

---

## Quick command reference

```bash
# Install deps
npm install

# Type check
npx tsc --noEmit

# Local dev (Expo Go — no native modules)
npx expo start

# Local dev build (full native, AdMob works)
npx expo run:android   # or run:ios

# Production builds
eas build --platform ios     --profile production
eas build --platform android --profile production

# Submit
eas submit --platform ios     --latest
eas submit --platform android --latest --track internal

# Hotfix without a store re-review (JS only)
eas update --branch production --message "Fix combat resolution bug"
```
