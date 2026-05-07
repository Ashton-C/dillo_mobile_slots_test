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

// ---------------------------------------------------------------------------
// revenueCatWebhook — server-side authority for IAP grants
//
// RevenueCat POSTs purchase events to this endpoint after validating the
// receipt with Apple/Google. The client never grants paid resources directly
// in production — it just kicks off the purchase and trusts this webhook to
// land the rewards in the user's Firestore doc.
//
// Configure the URL in RevenueCat → Project Settings → Integrations → Webhooks.
// The Authorization header must equal the REVENUECAT_WEBHOOK_AUTH secret
// (set with `firebase functions:secrets:set`); requests with the wrong header
// are rejected with 401.
//
// MUST stay in sync with src/services/StoreService.ts PACKS table and
// src/services/CosmeticsService.ts BUNDLE_GRANTS table. The shapes are
// duplicated below — annotate any change you make in *both* places.
// ---------------------------------------------------------------------------

interface PackReward {
  credits?: number;
  fuel?: number;
  boost?: number;
  shields?: number;
  spinRefill?: boolean;
}

// Mirrors src/services/StoreService.ts PACKS — only id → rewards.
const PACK_REWARDS: Record<string, PackReward> = {
  cr_pocket:  { credits: 1_000 },
  cr_hoard:   { credits: 5_000 },
  cr_vault:   { credits: 25_000 },
  cr_forge:   { credits: 100_000 },
  sp_refill:  { spinRefill: true },
  rs_fuel5:   { fuel: 5 },
  rs_boost5:  { boost: 5 },
  rs_shield5: { shields: 5 },
  bd_starter: { spinRefill: true, credits: 2_500, fuel: 3 },
  bd_war:     { fuel: 5, boost: 5, shields: 5 },
};

// Mirrors src/services/CosmeticsService.ts BUNDLE_GRANTS — cosmetic-bundle SKUs
// that grant multiple cosmetic IDs plus optional bonus credits.
const COSMETIC_BUNDLE_GRANTS: Record<string, { ids: string[]; bonusCredits?: number }> = {
  bundle_pilot:   { ids: ['sym_retro', 'suit_outlaw'],          bonusCredits: 2000 },
  bundle_cmdr:    { ids: ['theme_deep_reef', 'hud_tactical', 'emblem_ace'] },
  bundle_founder: { ids: ['emblem_chromatic', 'suit_riftwalker', 'bg_void_rift', 'title_sovereign'] },
};

// Single-cosmetic SKUs — every cosmetic that has an iapPrice in
// COSMETICS_CATALOG. Server-only authority over ownership; client merges via
// users/{uid}.ownedCosmetics on subscribe.
const COSMETIC_PRODUCT_IDS = new Set<string>([
  'theme_blood_moon', 'theme_vault',
  'sym_squad',
  'suit_nebula',     // (deleted from catalog but kept here as defensive no-op
  'suit_sovereign',  //  in case a stray purchase still lands)
  'emblem_chromatic',
  'title_sovereign', 'title_void_adm',
  'btn_gold',
  'bg_void_rift', 'bg_submerged',
  'hud_quantum',
  'helmet_sovereign',
  'frame_sovereign',
  'nameplate_sovereign',
  'acc_sash_sovereign',
]);

// Build-skip is intentionally NOT in the webhook map. It's applied client-side
// after a successful iapService.purchase(); the worst-case abuse is a free
// build skip, which is low-stakes enough to skip server validation.

const MAX_FUEL_CAP    = 50;
const MAX_BOOST_CAP   = 50;
const MAX_SHIELDS_CAP = 50;
const MAX_SPINS_CAP   = 50;

function applyPackToUserData(
  user: admin.firestore.DocumentData,
  reward: PackReward,
): Partial<admin.firestore.DocumentData> {
  const next: admin.firestore.DocumentData = {};
  if (reward.credits)    next.credits = (user.credits ?? 0) + reward.credits;
  if (reward.fuel)       next.attacks = Math.min(MAX_FUEL_CAP,    (user.attacks ?? 0) + reward.fuel);
  if (reward.boost)      next.raids   = Math.min(MAX_BOOST_CAP,   (user.raids   ?? 0) + reward.boost);
  if (reward.shields)    next.shields = Math.min(MAX_SHIELDS_CAP, (user.shields ?? 0) + reward.shields);
  if (reward.spinRefill) {
    next.spinsRemaining  = MAX_SPINS_CAP;
    next.spinRefillStart = 0;
  }
  return next;
}

interface RcEvent {
  type?: string;          // INITIAL_PURCHASE, NON_RENEWING_PURCHASE, RENEWAL, …
  app_user_id?: string;
  product_id?: string;
  transaction_id?: string;
  original_transaction_id?: string;
}

// Event types that GRANT rewards. CANCELLATION/REFUND/EXPIRATION should NOT
// roll back grants here — that's a separate flow (see MONETIZATION_CHECKLIST.md
// "Refund handling"). Keep this list narrow on purpose.
const GRANT_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
]);

export const revenueCatWebhook = functions
  .runWith({ secrets: ['REVENUECAT_WEBHOOK_AUTH'] })
  .https.onRequest(async (req, res) => {
    // Reject anything that isn't a POST so accidental browser visits don't
    // trip the auth path.
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH ?? '';
    const got = req.header('Authorization') ?? '';
    if (!expectedAuth || got !== `Bearer ${expectedAuth}`) {
      functions.logger.warn('revenueCatWebhook: bad auth');
      res.status(401).send('Unauthorized');
      return;
    }

    const event: RcEvent | undefined = req.body?.event;
    if (!event?.type || !event?.app_user_id || !event?.product_id) {
      functions.logger.warn('revenueCatWebhook: missing fields', { event });
      // Return 200 so RC doesn't retry; we have nothing to do here.
      res.status(200).send('ignored');
      return;
    }

    if (!GRANT_EVENT_TYPES.has(event.type)) {
      functions.logger.info(`revenueCatWebhook: skip non-grant event ${event.type}`);
      res.status(200).send('skipped');
      return;
    }

    const txnId = event.transaction_id ?? event.original_transaction_id;
    if (!txnId) {
      functions.logger.warn('revenueCatWebhook: missing transaction_id');
      res.status(200).send('ignored');
      return;
    }

    const uid       = event.app_user_id;
    const productId = event.product_id;
    const txnRef    = db.doc(`iapTransactions/${txnId}`);
    const userRef   = db.doc(`users/${uid}`);

    try {
      // Idempotency: a failed `create` here means the event was already
      // applied. RC retries on non-2xx so we want one-and-only-once delivery.
      const grant = await db.runTransaction(async (tx) => {
        const existing = await tx.get(txnRef);
        if (existing.exists) {
          return { applied: false, reason: 'duplicate' as const };
        }

        const userSnap = await tx.get(userRef);
        if (!userSnap.exists) {
          // RC sometimes fires before the client finishes provisioning the
          // user doc on first sign-in. Tell RC to retry — it'll back off.
          throw new Error('user-doc-missing');
        }
        const user = userSnap.data() as admin.firestore.DocumentData;

        // Resolve reward payload --------------------------------------------
        const packReward: PackReward = { ...(PACK_REWARDS[productId] ?? {}) };
        const cosmeticIdsToGrant: string[] = [];

        const bundle = COSMETIC_BUNDLE_GRANTS[productId];
        if (bundle) {
          if (bundle.bonusCredits) {
            packReward.credits = (packReward.credits ?? 0) + bundle.bonusCredits;
          }
          cosmeticIdsToGrant.push(...bundle.ids);
        }

        if (COSMETIC_PRODUCT_IDS.has(productId)) {
          cosmeticIdsToGrant.push(productId);
        }

        const haveResourceGrant = Object.keys(packReward).length > 0;
        const haveCosmeticGrant = cosmeticIdsToGrant.length > 0;
        if (!haveResourceGrant && !haveCosmeticGrant) {
          functions.logger.warn(`revenueCatWebhook: unknown product ${productId}`);
          return { applied: false, reason: 'unknown-product' as const };
        }

        // Apply ---------------------------------------------------------------
        const update: admin.firestore.DocumentData = haveResourceGrant
          ? applyPackToUserData(user, packReward)
          : {};
        if (haveCosmeticGrant) {
          update.ownedCosmetics = admin.firestore.FieldValue.arrayUnion(...cosmeticIdsToGrant);
        }
        update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        tx.update(userRef, update);

        // Permanent record so we can deduplicate retries and audit later.
        tx.set(txnRef, {
          uid,
          productId,
          transactionId: txnId,
          eventType: event.type,
          appliedAt: admin.firestore.FieldValue.serverTimestamp(),
          packReward: haveResourceGrant ? packReward : null,
          cosmeticGrants: cosmeticIdsToGrant,
        });

        return { applied: true, reason: 'ok' as const, packReward, cosmeticIdsToGrant };
      });

      if (grant.applied) {
        // Drop a small event so the client can banner "Purchase delivered".
        await db.collection(`users/${uid}/events`).add({
          type: 'COMBAT_RESULT', // re-uses the existing toast UI for now
          fromUid: 'iap',
          fromDisplayName: 'STORE',
          attackerWon: true,
          creditsGained: grant.packReward?.credits ?? 0,
          timestamp: Date.now(),
          read: false,
        });
        functions.logger.info(`revenueCatWebhook: applied ${productId} for ${uid}`);
      } else {
        functions.logger.info(`revenueCatWebhook: ${grant.reason} ${productId} for ${uid}`);
      }

      res.status(200).send('ok');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // user-doc-missing → 503 so RC retries with backoff. Other errors get
      // 500 so we see them in logs and RC also retries.
      const status = msg === 'user-doc-missing' ? 503 : 500;
      functions.logger.error('revenueCatWebhook: failure', { uid, productId, txnId, err: msg });
      res.status(status).send(msg);
    }
  });
