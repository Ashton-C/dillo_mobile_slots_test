/**
 * clear-mock-users.js
 *
 * Removes the dev/mock players seeded by `seed-mock-users.js` so they stop
 * appearing on RADAR (the WIRE tab).
 *
 * Usage:
 *   node scripts/clear-mock-users.js
 *
 * To use with the emulator:
 *   FIRESTORE_EMULATOR_HOST=localhost:8080 node scripts/clear-mock-users.js
 *
 * Requires: GOOGLE_APPLICATION_CREDENTIALS or emulator host.
 */

const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (!getApps().length) {
  initializeApp(
    process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? { credential: cert(process.env.GOOGLE_APPLICATION_CREDENTIALS) }
      : undefined
  );
}

const db = getFirestore();

const MOCK_UIDS = ['mock-user-alpha', 'mock-user-beta'];

async function deleteSubcollection(parentPath, subName) {
  const snap = await db.collection(`${parentPath}/${subName}`).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
  return snap.size;
}

async function clear() {
  console.log('Clearing mock players from WIRE...\n');

  for (const uid of MOCK_UIDS) {
    const eventsCleared = await deleteSubcollection(`users/${uid}`, 'events');
    await db.doc(`users/${uid}`).delete();
    await db.doc(`habitats/habitat-${uid}`).delete();
    await db.doc(`playerIndex/${uid}`).delete();
    console.log(`✓  removed ${uid}  (events: ${eventsCleared})`);
  }

  console.log('\nDone. Re-run scripts/seed-mock-users.js to restore them.');
}

clear().catch((err) => {
  console.error('Clear failed:', err);
  process.exit(1);
});
