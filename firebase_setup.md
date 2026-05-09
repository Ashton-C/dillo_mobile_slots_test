# Firebase Setup Guide — Reelwright

Follow these steps when you're ready to connect the live backend. Takes about 15 minutes start to finish.

---

## Step 1 — Create the Firebase Project

1. Go to **[console.firebase.google.com](https://console.firebase.google.com)**
2. Click **Add project** → name it `reelwright`
3. Disable Google Analytics (not needed yet — add later for Phase 3)
4. Click **Create project**

---

## Step 2 — Register the App

1. From the project overview, click the **`</>`** (Web) icon to add a web app
   *(Expo uses the web SDK even on mobile)*
2. Name it `reelwright-expo`
3. Do **not** enable Firebase Hosting
4. Copy the `firebaseConfig` object — you'll need it in Step 4

---

## Step 3 — Enable Authentication

1. Left sidebar → **Build → Authentication → Get started**
2. Under **Sign-in method**, enable:
   - **Anonymous** — allows guest play before account creation
   - **Email/Password** — for persistent accounts
3. Save

---

## Step 4 — Create Firestore Database

1. Left sidebar → **Build → Firestore Database → Create database**
2. Select **Start in test mode** *(we'll lock it down before going live)*
3. Region: **`us-central1`** (recommended for lowest latency)
4. Click **Enable**

The three collections the app uses will be created automatically on first write:
| Collection | Document ID | Schema |
|---|---|---|
| `users` | Firebase Auth UID | `src/models/User.ts` |
| `habitats` | Auto-generated | `src/models/Habitat.ts` |
| `anomalies` | `current` (single doc) | `AnomalyService` (Phase 2) |

---

## Step 5 — Set Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
2. Open `.env.local` and fill in the values from the `firebaseConfig` object you copied in Step 2.
   Find them anytime at: **Project Settings → General → Your apps → SDK setup and configuration**

```env
EXPO_PUBLIC_FIREBASE_API_KEY=AIza...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=reelwright.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=reelwright
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=reelwright.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

> `.env.local` is git-ignored. Never commit real credentials.

---

## Step 6 — Deploy Security Rules and Indexes

The rules and composite indexes live in version-controlled files at the repo root:

- `firestore.rules` — the security rules
- `firestore.indexes.json` — the composite indexes used by `refillSpins` and the RADAR scan

Deploy both before inviting any real users:

```bash
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
```

Anomalies (`anomalies/current`) are server-only writes — clients only read. The
`seedAnomaly` Cloud Function (deployed in Step 7) seeds the doc on a 4-hour
schedule.

If you need to inspect or hand-edit the rules in the Firebase console, remember
to mirror the change back into `firestore.rules` so the next deploy doesn't
clobber it.

---

## Step 7 — Deploy Cloud Functions

The `resolveCombat` function lives in `functions/src/index.ts`. It triggers on every new `combatRequests` document and handles the full PvP resolution loop.

The repo ships with a root `firebase.json` (functions config) and `.firebaserc` (project alias `default → reelwright`). The CLI requires both — without them you'll see `Error: Not in a Firebase app directory (could not locate firebase.json)`.

If your Firebase project ID is something other than `reelwright`, either edit `.firebaserc` or run `firebase use --add` once to alias it.

Run the deploy from the **repo root** (not from `functions/`):

```bash
# From repo root
cd functions && npm install && cd ..
firebase deploy --only functions
```

The `predeploy` hook in `firebase.json` runs `npm run build` inside `functions/` automatically.

Requires the Firebase CLI: `npm install -g firebase-tools` and `firebase login`.

After deploy, confirm the function appears in **Firebase Console → Functions**. Test it by triggering a BREACH/EXTRACT from the RADAR screen — the outcome should appear in the EventBanner within a few seconds.

---

## Step 8 — Seed Mock Users for PvP Testing

Creates two fake players (`AlphaRaider` and `BetaOps`) in Firestore so the RADAR screen has targets to discover. Run once:

```bash
# Against live Firebase (needs service account or ADC login)
node scripts/seed-mock-users.js

# Against local emulator
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-mock-users.js
```

`AlphaRaider` has Outpost LVL 3 and TURRET LVL 2 (blocks 2 attacks/day). `BetaOps` is a softer target at Outpost LVL 1 with no TURRET.

To remove them later (e.g. before launch so real players don't see them on WIRE):

```bash
node scripts/clear-mock-users.js

# Or against the emulator
FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/clear-mock-users.js
```

This deletes both `users/`, `habitats/`, `playerIndex/` entries plus any queued events for the mock UIDs.

---

## Step 9 — Post-Setup Checklist

- [ ] `.env.local` filled in with real values
- [ ] Anonymous Auth enabled
- [ ] Firestore database created
- [ ] Security rules deployed (Step 6)
- [ ] Cloud Function deployed (Step 7)
- [ ] Mock users seeded (Step 8)
- [ ] Run `npx expo start --lan` and confirm no Firebase errors in Metro console

---

## What We're Building Next (Auth Session)

Once this setup is done, the coding session will:
1. Wire `firebase/auth` anonymous sign-in into the app startup flow
2. Create a `useAuthStore` that holds the current Firebase `User`
3. On first sign-in, write an initial `users/{uid}` doc to Firestore
4. Swap `useGameStore`'s local initial state for a Firestore `onSnapshot` listener
5. Stand up the `AnomalyService` using a shared `anomalies/current` doc
