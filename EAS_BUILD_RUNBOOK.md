# EAS Build Runbook — Reelwright (SDK 55)

The exact set of commands, environment variables, and verification steps to take a fresh clone of this repo and produce a working `eas build --profile development` Android APK / iOS dev-client on EAS servers.

If a step fails, read the **Troubleshooting** section at the bottom — every failure mode that has burned us is captured there.

---

## 0. Prerequisites

Install once on your dev machine:

```bash
# Node 22+ (matches CI / EAS workers)
node --version    # expect v22.x

# Expo + EAS CLI — installed globally so `npx` always finds them
npm install -g eas-cli@latest

# Sign in to Expo (interactive — opens browser if needed)
eas login

# Verify you're authenticated as the project owner
eas whoami
```

---

## 1. Required environment files

Two files must exist locally before you can build. Neither is committed.

### `.env.local` (project root)

This is read by `app.config.js` at build time and by `lib/firebase.ts` at runtime. Every value must be filled before a `production` build; `development` and `preview` will fall back to safe defaults if Firebase or AdMob keys are blank.

```bash
# Firebase — Firebase Console → Project Settings → Your Apps → SDK config
EXPO_PUBLIC_FIREBASE_API_KEY=
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
EXPO_PUBLIC_FIREBASE_APP_ID=

# AdMob App IDs — admob.google.com → Apps → App ID  (ca-app-pub-XXX~YYY)
# Leave blank for dev/preview to fall back to Google's official test App IDs.
ADMOB_ANDROID_APP_ID=
ADMOB_IOS_APP_ID=

# AdMob rewarded ad unit IDs — AdMob → Ad Units  (ca-app-pub-XXX/ZZZ)
# Leave blank for dev/preview; AdsService falls back to the fake-watch modal.
ADMOB_REWARDED_ANDROID=
ADMOB_REWARDED_IOS=
```

> **Note:** `EAS_PROJECT_ID` is **not** an env var. It's hardcoded in `app.config.js` because the EAS CLI reads it before `.env.local` is loaded. If you forked the repo, regenerate the project ID with `eas init` and replace the literal in `app.config.js`.

### EAS environment secrets (server-side)

For `production` builds running on EAS servers, the same env vars must also live in the EAS environment so they're injected into the build worker. Run these once per project:

```bash
# Push every var from .env.local into EAS production env in one shot
eas env:push --environment production --path .env.local

# Verify
eas env:list --environment production
```

Repeat with `--environment preview` if you want internal testers to hit real Firebase.

---

## 2. Pinned dependency versions

This repo pins every native module to the SDK 55 bundled version. **Do not run `npm install <pkg>@latest`** without checking `npx expo install --check` first — npm can resolve to an SDK 56 / RN 0.86 version that breaks the gradle build.

The pins live in `package.json`. The critical ones:

| Package | Pinned version | Why |
|---|---|---|
| `expo` | `~55.0.19` | SDK floor |
| `react` | `19.2.0` | Required by RN 0.83 |
| `react-native` | `0.83.6` | Bundled with SDK 55, New Architecture default |
| `react-native-reanimated` | `4.2.1` | v4 requires `react-native-worklets` plugin |
| `react-native-worklets` | `0.7.4` | Replaces `react-native-reanimated/plugin` in babel config |
| `react-native-google-mobile-ads` | `16.3.3` | v14.7+ requires New Arch (= RN 0.75+); pinned exact, no caret |
| `expo-dev-client` | `~55.0.30` | Required by `developmentClient: true` profile |
| `expo-audio` | `~55.0.14` | Replaces deprecated `expo-av` |

If you bump anything, run `npx expo install --check` and fix every flag it raises before committing.

---

## 3. Static config sanity

Three files together define the build. None of them can disagree.

### `app.json`
- Static config. `name`, `slug`, `bundleIdentifier`, `package`, `version`, icon paths.
- `icon`, `splash.image`, `adaptiveIcon.foregroundImage`, `web.favicon` must all reference real files inside `assets/images/`.

### `app.config.js`
- Function form: `module.exports = ({ config }) => ({ ...config, ... })`
- Adds the `react-native-google-mobile-ads` plugin with App IDs from `process.env`.
- Injects Firebase / AdMob / EAS extra fields from `process.env`.
- The EAS project ID `643f084a-afb7-4ef8-9336-f483460387de` is hardcoded under `extra.eas.projectId` — leave it alone unless you forked the project.

### `eas.json`
- `development` profile: `developmentClient: true`, `distribution: internal`. Produces an APK / dev-client IPA that wraps the JS bundler.
- `preview` profile: `distribution: internal`. Production-shaped build, internal distribution (TestFlight / APK download link).
- `production` profile: empty `{}` — uses defaults, intended for store submission.

Verify the merge before every build:

```bash
npx expo config --json | jq '.sdkVersion, .name, .android.package, .ios.bundleIdentifier'
# expect: "55.0.0", "Reelwright", "com.reelwright.app", "com.reelwright.app"
```

---

## 4. Pre-build verification (run every time)

```bash
# 1. Clean install — match EAS's fresh-clone behavior
rm -rf node_modules
npm install

# 2. Verify all SDK 55 pins are correct (network required)
npx expo install --check
# Expect: "Dependencies are up to date" — if not, run with --fix

# 3. Type check
npx tsc --noEmit
# Expect: exit 0, no output

# 4. Run tests
npx jest --no-watch
# Expect: 37 passed

# 5. Doctor — config sanity
npx expo-doctor
# 16/18 expected to pass. The 2 that fail in offline mode (api.expo.dev
# unreachable) are: "Check Expo config schema" and "Validate packages
# against React Native Directory". Both pass on EAS workers.
```

If any of steps 2–4 fail, **fix before invoking eas build**. EAS workers cost real time and the failure will not surface until ~10 minutes in.

---

## 5. Build commands

```bash
# Development build — installable APK / dev-client IPA, hot reload via Metro
eas build --profile development --platform android
eas build --profile development --platform ios

# Preview — production-shaped, distributed via internal links
eas build --profile preview --platform android
eas build --profile preview --platform ios

# Production — store submission candidate (bumps versionCode/buildNumber required first)
eas build --profile production --platform all
```

Each command:
- Bumps a build number on EAS (you do **not** edit `versionCode` / `buildNumber` for dev/preview)
- Tarballs the project, uploads to EAS workers
- Runs `npx expo prebuild` fresh (because `/android` and `/ios` are gitignored — CNG)
- Runs gradle (Android) or xcodebuild (iOS) on a managed worker
- Returns a download URL on success, or a build log URL on failure

For **production** builds you bump `app.json` first:

```json
{
  "expo": {
    "version": "0.3.0",                  // bump
    "ios": { "buildNumber": "2" },       // increment monotonically
    "android": { "versionCode": 2 }      // increment monotonically
  }
}
```

---

## 6. Post-build (development)

```bash
# Install the dev-client APK on a device or emulator
eas build:run --platform android --latest

# Then start Metro and let the dev-client connect
npx expo start --dev-client
```

For iOS, install the IPA via TestFlight (preview profile) or directly to a provisioned device.

---

## 7. Submitting to stores (production)

```bash
# Configure once
eas submit:configure

# Submit the latest production build
eas submit --profile production --platform ios
eas submit --profile production --platform android
```

Both stores require additional one-time setup — App Store Connect API key for iOS, service account JSON for Android. See `DEPLOY_CHECKLIST.md` for the full submission checklist.

---

## 8. Branch and CI hygiene

- All migration / SDK-bump work happens on a `build/dev/claude/vN` branch
- Native folders (`/android`, `/ios`) are gitignored — EAS regenerates them via `npx expo prebuild` every build (CNG = Continuous Native Generation)
- `package-lock.json` is committed and authoritative. Never delete it on a feature branch unless you intend a full reinstall
- Don't commit `.env.local`, never commit secrets

---

## Troubleshooting

### "Plugin [id: 'expo-module-gradle-plugin'] was not found"
Cause: `expo-dev-client` is missing from `package.json` but a profile sets `developmentClient: true`. EAS pulls in a too-new transitive dep that needs a plugin published with newer expo-modules-core.
Fix: `npx expo install expo-dev-client` then commit the lockfile change.

### "Too many arguments for public constructor ViewGroupManager<T>"
Cause: `react-native-google-mobile-ads@>=14.7` requires the New Architecture. On RN 0.74 (SDK 51) this fails to compile. Fixed by upgrading to SDK 55 / RN 0.83 (where New Arch is default).
If it returns: pin the package exactly (no caret) and confirm `expo.jsEngine` is `hermes` (default) and `newArchEnabled` is on by default in 0.83.

### "Cannot automatically write to dynamic config at: app.config.js"
Cause: EAS CLI tried to inject `extra.eas.projectId` into a dynamic config but the value didn't exist statically.
Fix: hardcode the project ID literal in `app.config.js` under `extra.eas.projectId` — already done in this repo.

### "Could not resolve dependency: peer react@'^16.8.0 || ^17.0.0 || ^18.0.0' from react-query@3"
Cause: `react-query` v3 doesn't support React 19 (which ships with SDK 55).
Fix: It's been removed in this repo. If you re-add server state, use `@tanstack/react-query@^5` instead.

### "Expected 1 arguments, but got 0" on `useRef<T>()`
Cause: React 19's `@types/react` requires an explicit initial value.
Fix: `useRef<T | undefined>(undefined)` instead of `useRef<T>()`.

### "Namespace 'Animated' has no exported member 'SharedValue'"
Cause: Reanimated 4 moved `SharedValue` to a top-level export.
Fix: `import { type SharedValue } from 'react-native-reanimated'` and use `SharedValue<T>` instead of `Animated.SharedValue<T>`.

### `expo-doctor` reports "missing peer dependency: expo-asset"
Cause: `expo-audio` requires `expo-asset` and we didn't have it.
Fix: `npm install expo-asset@~55.0.16` — already in this repo.

### `expo-doctor` warns "app.config.js is not using the values from app.json"
Cause: app.config.js used `module.exports = { ...require('./app.json'), ... }` which doctor doesn't pattern-match.
Fix: switched to function form `({ config }) => ({ ...config })` — already done.

### Gradle: build fails with cryptic "release" SoftwareComponent error
Cause: AGP / Kotlin version mismatch — usually a transitive dep resolved to a version that needs newer Gradle than what RN 0.83 ships.
Fix: re-run `npx expo install --check --fix` to lock everything to SDK-bundled versions. Never bump native modules without this check.

### "ENOENT: no such file or directory, open './assets/images/icon.png'"
Cause: `assets/images/` is not committed. `app.json`'s icon paths must point to existing files.
Fix: Generate at minimum 4 PNGs (icon 1024×1024, adaptive-icon 1024×1024, splash 1242×2688, favicon 48×48). The repo already has these as placeholders; replace before launch.

---

## Changelog

| Date | Change |
|---|---|
| 2026-05-04 | SDK 51 → SDK 55 migration (RN 0.74 → 0.83, React 18 → 19, Reanimated 3 → 4, expo-av → expo-audio); removed unused `react-query` v3; pinned all native modules to bundled versions; fixed `useRef`/`SharedValue` types for React 19. |
