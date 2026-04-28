# Firebase Setup Guide — Sovereign Slots

Follow these steps when you're ready to connect the live backend. Takes about 15 minutes start to finish.

---

## Step 1 — Create the Firebase Project

1. Go to **[console.firebase.google.com](https://console.firebase.google.com)**
2. Click **Add project** → name it `sovereign-slots`
3. Disable Google Analytics (not needed yet — add later for Phase 3)
4. Click **Create project**

---

## Step 2 — Register the App

1. From the project overview, click the **`</>`** (Web) icon to add a web app
   *(Expo uses the web SDK even on mobile)*
2. Name it `sovereign-slots-expo`
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
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=sovereign-slots.firebaseapp.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=sovereign-slots
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=sovereign-slots.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
EXPO_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

> `.env.local` is git-ignored. Never commit real credentials.

---

## Step 6 — Starter Security Rules

Replace the default test-mode rules in **Firestore → Rules** with these before inviting any real users:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only read/write their own document
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }

    // Habitat: any authenticated user can read (needed for raids/attacks).
    // Create requires ownerUid == caller; update/delete requires existing ownerUid match.
    match /habitats/{habitatId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null
        && request.auth.uid == request.resource.data.ownerUid;
      allow update, delete: if request.auth != null
        && request.auth.uid == resource.data.ownerUid;
    }

    // Anomalies are server-written only; clients read-only
    match /anomalies/{doc} {
      allow read: if request.auth != null;
      allow write: if false; // server-side Cloud Function only
    }
  }
}
```

---

## Step 7 — Post-Setup Checklist

- [ ] `.env.local` filled in with real values
- [ ] Anonymous + Email/Password auth enabled
- [ ] Firestore database created (test mode is fine for now)
- [ ] Run `npm run start:lan` and confirm **no Firebase errors** in the Metro console
- [ ] Sign-in flow wired in the app (next coding session)
- [ ] Security rules updated before any public testing

---

## What We're Building Next (Auth Session)

Once this setup is done, the coding session will:
1. Wire `firebase/auth` anonymous sign-in into the app startup flow
2. Create a `useAuthStore` that holds the current Firebase `User`
3. On first sign-in, write an initial `users/{uid}` doc to Firestore
4. Swap `useGameStore`'s local initial state for a Firestore `onSnapshot` listener
5. Stand up the `AnomalyService` using a shared `anomalies/current` doc
