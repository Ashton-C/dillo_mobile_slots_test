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
  activeDrones?: { type?: string }[];
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
// Roulette: 8/75/110/145. Blackjack adds 90/130. Anything else is rejected.
const VALID_POWERS = new Set([8, 75, 90, 110, 130, 145]);

// Loot tier thresholds (matched to attackerPower bands). Used for both BREACH
// roulette and EXTRACTION blackjack outputs.
const LOOT_TIER = {
  1: { pct: 0.05, floor: 100, ceil: 250 }, // power 75 / 90  (EVEN-ish)
  2: { pct: 0.08, floor: 150, ceil: 400 }, // power 110      (SECTOR-ish)
  3: { pct: 0.12, floor: 250, ceil: 700 }, // power 130 / 145 (JACKPOT)
} as const;

function powerToTier(power: number): 1 | 2 | 3 {
  if (power >= 130) return 3;
  if (power >= 100) return 2;
  return 1;
}

function vaultReduction(vaultLevel: number): number {
  return Math.min(0.75, vaultLevel * VAULT_REDUCTION_PER_LEVEL);
}

// Anomaly raid-loot bonus: only RAID_SHADOW (+50%) and VOID_STORM (+20%)
// touch raid math today. Read here so the bonus moves from "client UI flavor"
// to actually-applied combat math.
function anomalyRaidBonus(anomalyId: string | undefined): number {
  if (anomalyId === 'RAID_SHADOW') return 0.5;
  if (anomalyId === 'VOID_STORM')  return 0.2;
  return 0;
}

// RAIDER drone (if currently active for the attacker) → +40% raid loot.
// Other drones don't affect raid math.
function attackerDroneRaidBonus(activeDrones: { type?: string }[] | undefined): number {
  if (!activeDrones?.length) return 0;
  return activeDrones.some((d) => d.type === 'RAIDER') ? 0.4 : 0;
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
      // Bumped from `outpostLevel * 10 + rand(0..49)` to `*11 + 25 + rand(0..40)`
      // so even outpost-1 defenders sit at 36..76 instead of 10..59 — the
      // EVEN-tier 75 power no longer auto-wins.
      const defenderOutpostLevel = defenderHabitat?.data.outpostLevel ?? 1;
      const defenderPower =
        defenderOutpostLevel * 11 + 25 + Math.floor(Math.random() * 41);

      const attackerWon = attackerPower > defenderPower;

      if (attackerWon) {
        // --- Wallet-percent loot, closed-loop (defender loses == attacker gains) ---
        const tier = powerToTier(attackerPower);
        const { pct, floor, ceil } = LOOT_TIER[tier];

        // Anomaly + drone bonuses come from server-authoritative reads.
        const [anomalySnap] = await Promise.all([
          db.doc('anomalies/current').get(),
        ]);
        const anomalyId = anomalySnap.exists ? (anomalySnap.data()?.id as string | undefined) : undefined;
        const totalRaidBonus = Math.min(
          1.0,
          anomalyRaidBonus(anomalyId) + attackerDroneRaidBonus(attacker.activeDrones),
        );

        const baseFromWallet = defender.credits * pct;
        const baseClamped    = Math.max(floor, Math.min(ceil, baseFromWallet));
        const baseBonused    = Math.floor(baseClamped * (1 + totalRaidBonus));

        const reduction   = vaultReduction(vaultLevel);
        const creditsLost = Math.floor(baseBonused * (1 - reduction));
        // Closed loop: attacker receives exactly what defender lost. No minting.
        // Cap the actual transfer at the defender's wallet so we never withdraw
        // more than they had — VAULT-reduced loss already kept this realistic
        // for whales, but a near-broke defender shouldn't pay more than they own.
        const transferred = Math.min(creditsLost, defender.credits);

        const defenderNewCredits = defender.credits - transferred;
        const attackerNewCredits = attacker.credits + transferred;

        await Promise.all([
          db.doc(`users/${defenderUid}`).update({ credits: defenderNewCredits }),
          db.doc(`users/${attackerUid}`).update({ credits: attackerNewCredits }),
          writeEvent(defenderUid, {
            type: type === 'INTRUSION' ? 'ATTACK_RESOLVED' : 'RAID_RESOLVED',
            fromUid: attackerUid,
            fromDisplayName: attacker.displayName,
            attackerWon: true,
            creditsLost: transferred,
          }),
          writeEvent(attackerUid, {
            type: 'COMBAT_RESULT',
            fromUid: defenderUid,
            fromDisplayName: defender.displayName,
            attackerWon: true,
            creditsGained: transferred,
          }),
        ]);

        await requestRef.update({
          status: 'RESOLVED',
          outcome: 'ATTACKER_WON',
          creditsLost: transferred,
          creditsGained: transferred,
          vaultReduction: reduction,
          anomalyBonus: anomalyRaidBonus(anomalyId),
          droneBonus: attackerDroneRaidBonus(attacker.activeDrones),
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
// refillSpins — scheduled every 15 minutes
// Tops up spins for any player who is below max and has an active refill timer.
// Skips users updated within the last 15 min — the client coalesces idle writes
// and persists on user-driven actions, so a recent updatedAt means the client
// already accounted for refill.
// ---------------------------------------------------------------------------

const MAX_SPINS = 50;
const SPIN_REFILL_MS = 5 * 60_000;
const REFILL_SCAN_INTERVAL_MS = 15 * 60_000;

export const refillSpins = functions.pubsub
  .schedule('every 15 minutes')
  .onRun(async () => {
    const now = Date.now();
    const cutoff = admin.firestore.Timestamp.fromMillis(now - REFILL_SCAN_INTERVAL_MS);
    const usersRef = db.collection('users');

    const snap = await usersRef
      .where('spinsRemaining', '<', MAX_SPINS)
      .where('spinRefillStart', '>', 0)
      .where('updatedAt', '<', cutoff)
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

// ---------------------------------------------------------------------------
// seedAnomaly — scheduled every 4 hours
// Server is the only writer for anomalies/current. Picks a new anomaly
// (excluding the previously active one) and writes it. Clients only read.
// ---------------------------------------------------------------------------

type AnomalyId =
  | 'SOLAR_SURGE'
  | 'VOID_STORM'
  | 'CREDIT_BLOOM'
  | 'SHIELD_PULSE'
  | 'RAID_SHADOW'
  | 'CALM';

const ANOMALY_IDS: AnomalyId[] = [
  'SOLAR_SURGE',
  'VOID_STORM',
  'CREDIT_BLOOM',
  'SHIELD_PULSE',
  'RAID_SHADOW',
  'CALM',
];
const ANOMALY_DURATION_MS = 4 * 60 * 60 * 1000;

export const seedAnomaly = functions.pubsub
  .schedule('every 4 hours')
  .onRun(async () => {
    const ref = db.doc('anomalies/current');
    const existing = await ref.get();
    const previousId = existing.exists ? (existing.data()?.id as AnomalyId | undefined) ?? null : null;

    // CALM is half-weighted vs the others.
    const pool: AnomalyId[] = ANOMALY_IDS.flatMap((id) => {
      if (id === previousId) return [];
      return id === 'CALM' ? [id] : [id, id];
    });
    const id = pool[Math.floor(Math.random() * pool.length)];
    const now = Date.now();

    await ref.set({
      id,
      startedAt: now,
      endsAt: now + ANOMALY_DURATION_MS,
    });

    functions.logger.info(`seedAnomaly: ${previousId ?? '(none)'} -> ${id}`);
  });
