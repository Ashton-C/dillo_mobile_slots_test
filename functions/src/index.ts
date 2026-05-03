import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CombatRequest {
  attackerUid: string;
  defenderUid: string;
  type: 'INTRUSION' | 'EXTRACTION';
  attackerPower: number;
  status: 'PENDING' | 'RESOLVED';
  createdAt: admin.firestore.Timestamp;
}

interface UserDoc {
  credits: number;
  shields: number;
  level: number;
  displayName: string;
  avatarColor: string;
}

interface HabitatDoc {
  buildingLevels: Partial<Record<string, number>>;
  outpostLevel?: number;
  // TURRET daily charge tracking
  turretCharges?: number;
  turretResetAt?: number; // unix ms
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VAULT_REDUCTION_PER_LEVEL = 0.05; // 5% credit loss reduction per VAULT level
const VALID_POWERS = new Set([8, 75, 110, 145]);

function vaultReduction(vaultLevel: number): number {
  return Math.min(0.75, vaultLevel * VAULT_REDUCTION_PER_LEVEL);
}

async function getHabitatForUser(uid: string): Promise<{ id: string; data: HabitatDoc } | null> {
  const userSnap = await db.doc(`users/${uid}`).get();
  if (!userSnap.exists) return null;
  const habitatId = userSnap.data()?.habitatId as string | undefined;
  if (!habitatId) return null;
  const habitatSnap = await db.doc(`habitats/${habitatId}`).get();
  if (!habitatSnap.exists) return null;
  return { id: habitatId, data: habitatSnap.data() as HabitatDoc };
}

function isSameDayUTC(ts: number): boolean {
  const now = new Date();
  const d = new Date(ts);
  return (
    now.getUTCFullYear() === d.getUTCFullYear() &&
    now.getUTCMonth() === d.getUTCMonth() &&
    now.getUTCDate() === d.getUTCDate()
  );
}

async function consumeTurretCharge(
  habitatId: string,
  habitatData: HabitatDoc,
  turretLevel: number,
): Promise<boolean> {
  const maxCharges = turretLevel;
  const resetAt = habitatData.turretResetAt ?? 0;
  const chargesUsed = isSameDayUTC(resetAt) ? (habitatData.turretCharges ?? 0) : 0;

  if (chargesUsed >= maxCharges) return false; // no charges left today

  await db.doc(`habitats/${habitatId}`).update({
    turretCharges: chargesUsed + 1,
    turretResetAt: Date.now(),
  });
  return true;
}

async function writeEvent(
  uid: string,
  event: object,
): Promise<void> {
  await db.collection(`users/${uid}/events`).add({
    ...event,
    timestamp: Date.now(),
    read: false,
  });
}

// ---------------------------------------------------------------------------
// resolveCombat — triggered on combatRequest create
// ---------------------------------------------------------------------------

export const resolveCombat = functions.firestore
  .document('combatRequests/{requestId}')
  .onCreate(async (snap, context) => {
    const request = snap.data() as CombatRequest;
    const { attackerUid, defenderUid, type, attackerPower } = request;
    const requestRef = snap.ref;

    if (!VALID_POWERS.has(attackerPower)) {
      await requestRef.update({ status: 'ERROR', error: 'Invalid attackerPower' });
      return;
    }

    // Mark in-flight immediately to prevent double-processing
    await requestRef.update({ status: 'PROCESSING' });

    try {
      // --- Load both players ---
      const [attackerSnap, defenderSnap] = await Promise.all([
        db.doc(`users/${attackerUid}`).get(),
        db.doc(`users/${defenderUid}`).get(),
      ]);

      if (!attackerSnap.exists || !defenderSnap.exists) {
        await requestRef.update({ status: 'ERROR', error: 'Player not found' });
        return;
      }

      const attacker = attackerSnap.data() as UserDoc;
      const defender = defenderSnap.data() as UserDoc;

      // --- Load defender's habitat for TURRET + VAULT levels ---
      const defenderHabitat = await getHabitatForUser(defenderUid);
      const defBuildingLevels = defenderHabitat?.data.buildingLevels ?? {};
      const turretLevel = defBuildingLevels['TURRET'] ?? 0;
      const vaultLevel  = defBuildingLevels['VAULT']  ?? 0;

      // --- TURRET check (auto-block) ---
      let blockedByTurret = false;
      if (turretLevel > 0 && defenderHabitat) {
        blockedByTurret = await consumeTurretCharge(
          defenderHabitat.id,
          defenderHabitat.data,
          turretLevel,
        );
      }

      if (blockedByTurret) {
        // Attacker is blocked — no credit change, both get notified
        await Promise.all([
          writeEvent(defenderUid, {
            type: 'ATTACK_RESOLVED',
            fromUid: attackerUid,
            fromDisplayName: attacker.displayName,
            attackerWon: false,
            blockedByTurret: true,
          }),
          writeEvent(attackerUid, {
            type: 'COMBAT_RESULT',
            fromUid: defenderUid,
            fromDisplayName: defender.displayName,
            attackerWon: false,
            blockedByTurret: true,
          }),
        ]);
        await requestRef.update({ status: 'RESOLVED', outcome: 'BLOCKED_BY_TURRET' });
        return;
      }

      // --- Compute defender power ---
      const defenderOutpostLevel = defenderHabitat?.data.outpostLevel ?? 1;
      const defenderPower = defenderOutpostLevel * 10 + Math.floor(Math.random() * 50);

      const attackerWon = attackerPower > defenderPower;

      if (attackerWon) {
        // --- Tiered loot based on roulette bet tier ---
        const creditsGained   = attackerPower >= 130 ? 350 : attackerPower >= 100 ? 225 : 150;
        const creditsLostBase = attackerPower >= 130 ? 400 : attackerPower >= 100 ? 270 : 200;
        const reduction = vaultReduction(vaultLevel);
        const creditsLost = Math.round(creditsLostBase * (1 - reduction));

        const defenderNewCredits  = Math.max(0, defender.credits - creditsLost);
        const attackerNewCredits  = attacker.credits + creditsGained;

        await Promise.all([
          db.doc(`users/${defenderUid}`).update({ credits: defenderNewCredits }),
          db.doc(`users/${attackerUid}`).update({ credits: attackerNewCredits }),
          writeEvent(defenderUid, {
            type: type === 'INTRUSION' ? 'ATTACK_RESOLVED' : 'RAID_RESOLVED',
            fromUid: attackerUid,
            fromDisplayName: attacker.displayName,
            attackerWon: true,
            creditsLost,
          }),
          writeEvent(attackerUid, {
            type: 'COMBAT_RESULT',
            fromUid: defenderUid,
            fromDisplayName: defender.displayName,
            attackerWon: true,
            creditsGained,
          }),
        ]);

        await requestRef.update({
          status: 'RESOLVED',
          outcome: 'ATTACKER_WON',
          creditsLost,
          creditsGained,
          vaultReduction: reduction,
        });
      } else {
        // Attacker lost — no credit change
        await Promise.all([
          writeEvent(defenderUid, {
            type: type === 'INTRUSION' ? 'ATTACK_RESOLVED' : 'RAID_RESOLVED',
            fromUid: attackerUid,
            fromDisplayName: attacker.displayName,
            attackerWon: false,
          }),
          writeEvent(attackerUid, {
            type: 'COMBAT_RESULT',
            fromUid: defenderUid,
            fromDisplayName: defender.displayName,
            attackerWon: false,
          }),
        ]);

        await requestRef.update({ status: 'RESOLVED', outcome: 'DEFENDER_WON' });
      }
    } catch (err) {
      functions.logger.error('resolveCombat error', { requestId: context.params.requestId, err });
      await requestRef.update({ status: 'ERROR', error: String(err) });
    }
  });

// ---------------------------------------------------------------------------
// refillSpins — scheduled every 5 minutes
// Tops up spins for any player who is below max and has an active refill timer.
// This handles offline users — the client timer only runs when the app is open.
// ---------------------------------------------------------------------------

const MAX_SPINS = 50;
const SPIN_REFILL_MS = 5 * 60_000;

export const refillSpins = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const now = Date.now();
    const usersRef = db.collection('users');

    // Only query users actively refilling (spinRefillStart > 0, spins < max)
    const snap = await usersRef
      .where('spinsRemaining', '<', MAX_SPINS)
      .where('spinRefillStart', '>', 0)
      .get();

    if (snap.empty) return;

    const batch = db.batch();
    let updateCount = 0;

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const spinsRemaining: number = d.spinsRemaining ?? MAX_SPINS;
      const spinRefillStart: number = d.spinRefillStart ?? 0;
      if (spinRefillStart === 0 || spinsRemaining >= MAX_SPINS) return;

      const elapsed = now - spinRefillStart;
      const earned = Math.floor(elapsed / SPIN_REFILL_MS);
      if (earned <= 0) return;

      const newSpins = Math.min(MAX_SPINS, spinsRemaining + earned);
      const newRefillStart = newSpins >= MAX_SPINS
        ? 0
        : spinRefillStart + earned * SPIN_REFILL_MS;

      batch.update(docSnap.ref, {
        spinsRemaining: newSpins,
        spinRefillStart: newRefillStart,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      updateCount++;
    });

    await batch.commit();
    functions.logger.info(`refillSpins: updated ${updateCount} users`);
  });
