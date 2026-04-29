/**
 * seed-mock-users.js
 *
 * Creates 2 mock players in Firestore for local PvP testing.
 * Run once against your Firebase project (test mode or with admin credentials).
 *
 * Usage:
 *   node scripts/seed-mock-users.js
 *
 * Requires:
 *   GOOGLE_APPLICATION_CREDENTIALS env var pointing to a service account JSON,
 *   OR run inside the Firebase emulator (FIRESTORE_EMULATOR_HOST=localhost:8080).
 *
 * To use with the emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/seed-mock-users.js
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp(
    process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? { credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }
      : undefined // falls back to emulator / ADC
  );
}

const db = getFirestore();

const MOCK_USERS = [
  {
    uid: 'mock-user-alpha',
    displayName: 'AlphaRaider',
    avatarColor: '#00D4FF',
    credits: 2400,
    attacks: 8,
    raids: 4,
    shields: 2,
    intrusions: 3,
    extractions: 2,
    spinsRemaining: 35,
    spinRefillStart: 0,
    xp: 340,
    level: 4,
    hasSetUsername: true,
    outpostLevel: 3,
    buildingLevels: {
      GENERATOR: 2,
      ARMORY: 1,
      VAULT: 1,
      TURRET: 2,
      HANGAR: 1,
    },
  },
  {
    uid: 'mock-user-beta',
    displayName: 'BetaOps',
    avatarColor: '#39FF14',
    credits: 800,
    attacks: 3,
    raids: 1,
    shields: 5,
    intrusions: 1,
    extractions: 0,
    spinsRemaining: 50,
    spinRefillStart: 0,
    xp: 90,
    level: 2,
    hasSetUsername: true,
    outpostLevel: 1,
    buildingLevels: {
      GENERATOR: 1,
      ARMORY: 0,
      VAULT: 0,
      TURRET: 0,
      HANGAR: 1,
    },
  },
];

async function seed() {
  console.log('Seeding mock users...\n');

  for (const user of MOCK_USERS) {
    const { uid, outpostLevel, buildingLevels, ...userFields } = user;

    // Write user doc
    await db.doc(`users/${uid}`).set({
      uid,
      ...userFields,
      habitatId: `habitat-${uid}`,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Write habitat doc
    await db.doc(`habitats/habitat-${uid}`).set({
      ownerUid: uid,
      buildingLevels,
      outpostLevel,
      activeBuildJob: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });

    // Write player index entry (for RADAR discovery)
    await db.doc(`playerIndex/${uid}`).set({
      uid,
      displayName: userFields.displayName,
      avatarColor: userFields.avatarColor,
      outpostLevel,
      level: userFields.level,
      updatedAt: Timestamp.now(),
    });

    // Update user doc with habitatId reference
    await db.doc(`users/${uid}`).update({ habitatId: `habitat-${uid}` });

    console.log(`✓  ${userFields.displayName} (${uid})`);
    console.log(`   Credits: ${userFields.credits}  |  Outpost LVL ${outpostLevel}  |  Pilot LVL ${userFields.level}`);
    console.log(`   Buildings: ${JSON.stringify(buildingLevels)}\n`);
  }

  console.log('Done. Both players now appear in RADAR scans.');
  console.log('TURRET charges on AlphaRaider will auto-block up to 2 attacks/day.');
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
