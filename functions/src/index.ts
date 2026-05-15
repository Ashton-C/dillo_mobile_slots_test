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
  // Card system — Phase A reserves the field. The Phase C apply path will
  // read `cardId`, validate it lives in the attacker's `cards` map, decrement
  // the inventory, and run the card's effect descriptors inside resolveCombat.
  cardId?: string;
}

interface UserDoc {
  credits: number;
  shields: number;
  level: number;
  displayName: string;
  avatarColor: string;
  activeDrones?: { type?: string }[];
  expoPushToken?: string;
  lastAttackedAt?: number;
  // Card system inventory + active reel queue. Phase B writes activeReelCard
  // + activeReelCardSpinsLeft from the activateReelCard CF; Phase C reads
  // cards[cardId] inside resolveCombat to validate raid-card consumption.
  cards?: Record<string, number>;
  activeReelCard?: string | null;
  activeReelCardSpinsLeft?: number;
}

interface HabitatDoc {
  buildingLevels: Partial<Record<string, number>>;
  outpostLevel?: number;
  // TURRET daily charge tracking
  turretCharges?: number;
  turretResetAt?: number; // unix ms
  ownerUid?: string;
  activeBuildJob?: { type: string; targetLevel: number; completesAt: number; isOutpost?: boolean } | null;
}

// Per-defender attack cooldown. A successful or failed attack against a
// defender locks them from further raids for this many ms — stops raid-spam,
// caps push-notification frequency, and gives the defender breathing room.
const ATTACK_COOLDOWN_MS = 10 * 60 * 1000;

// Expo's push relay. Lower-friction than wiring APNs + FCM directly: send a
// single HTTPS POST with one or more tokens and Expo forwards to the
// appropriate transport.
const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

interface PushPayload {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
  priority?: 'default' | 'high';
}

async function sendPush(payload: PushPayload | PushPayload[]): Promise<void> {
  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      functions.logger.warn('sendPush: non-2xx', { status: res.status });
    }
  } catch (err) {
    functions.logger.warn('sendPush: fetch failed', { err: String(err) });
  }
}

async function pushToUser(
  uid: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
): Promise<void> {
  const userSnap = await db.doc(`users/${uid}`).get();
  const token = userSnap.exists ? (userSnap.data()?.expoPushToken as string | undefined) : undefined;
  if (!token) return;
  await sendPush({ to: token, title, body, data, sound: 'default', priority: 'high' });
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

      // --- Attack cooldown: refund attack-cost if defender was hit recently ---
      const lastAttackedAt = defender.lastAttackedAt ?? 0;
      if (lastAttackedAt > 0 && Date.now() - lastAttackedAt < ATTACK_COOLDOWN_MS) {
        const refundField = type === 'INTRUSION' ? 'intrusions' : 'extractions';
        const refundedValue = ((attackerSnap.data()?.[refundField] as number | undefined) ?? 0) + 1;
        await Promise.all([
          db.doc(`users/${attackerUid}`).update({ [refundField]: refundedValue }),
          writeEvent(attackerUid, {
            type: 'COMBAT_RESULT',
            fromUid: defenderUid,
            fromDisplayName: defender.displayName,
            attackerWon: false,
            cooldown: true,
          }),
        ]);
        await requestRef.update({ status: 'RESOLVED', outcome: 'BLOCKED_BY_COOLDOWN' });
        return;
      }

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
        // Attacker is blocked — no credit change, both get notified. Start the
        // cooldown so failed attacks can't be retried in a tight loop.
        await Promise.all([
          db.doc(`users/${defenderUid}`).update({ lastAttackedAt: Date.now() }),
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
          pushToUser(
            defenderUid,
            'TURRET ENGAGED',
            `${attacker.displayName} bounced off your turret.`,
            { type: 'attack-blocked' },
          ),
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
          db.doc(`users/${defenderUid}`).update({ credits: defenderNewCredits, lastAttackedAt: Date.now() }),
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
          pushToUser(
            defenderUid,
            type === 'INTRUSION' ? 'INCURSION DETECTED' : 'OUTPOST RAIDED',
            `${attacker.displayName} took ${transferred.toLocaleString()} CR. Log in to retaliate.`,
            { type: 'attack-won', attackerUid, creditsLost: transferred },
          ),
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
        // Attacker lost — no credit change, but start the cooldown anyway so
        // the defender gets breathing room from repeated attempts.
        await Promise.all([
          db.doc(`users/${defenderUid}`).update({ lastAttackedAt: Date.now() }),
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
          pushToUser(
            defenderUid,
            'ATTACK REPELLED',
            `${attacker.displayName} tried to raid you and bounced.`,
            { type: 'attack-repelled' },
          ),
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
  // Stardust (✦): build-skip premium currency. Additive, no cap.
  stardust?: number;
  fuel?: number;
  boost?: number;
  shields?: number;
  spinRefill?: boolean;
}

// Mirrors src/services/StoreService.ts PACKS — only id → rewards.
// MUST stay in sync; drift = a successful purchase that pays nothing.
const PACK_REWARDS: Record<string, PackReward> = {
  // Credit packs
  cr_pocket:  { credits: 1_000 },
  cr_hoard:   { credits: 5_000 },
  cr_vault:   { credits: 25_000 },
  cr_forge:   { credits: 100_000 },
  // Spin refill
  sp_refill:  { spinRefill: true },
  // Resource packs
  rs_fuel5:   { fuel: 5 },
  rs_boost5:  { boost: 5 },
  rs_shield5: { shields: 5 },
  // Resource bundles (no cosmetic grants — those go via COSMETIC_BUNDLE_GRANTS)
  bd_starter: { spinRefill: true, credits: 2_500, fuel: 3 },
  bd_war:     { fuel: 5, boost: 5, shields: 5 },
  // Stardust ladder (premium build-skip currency)
  sd_starter: { stardust: 100   },
  sd_handful: { stardust: 600   },
  sd_jar:     { stardust: 1_500 },
  sd_chest:   { stardust: 4_000 },
  sd_hoard:   { stardust: 10_000 },
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
  if (reward.credits)    next.credits  = (user.credits  ?? 0) + reward.credits;
  if (reward.stardust)   next.stardust = (user.stardust ?? 0) + reward.stardust;
  if (reward.fuel)       next.attacks  = Math.min(MAX_FUEL_CAP,    (user.attacks ?? 0) + reward.fuel);
  if (reward.boost)      next.raids    = Math.min(MAX_BOOST_CAP,   (user.raids   ?? 0) + reward.boost);
  if (reward.shields)    next.shields  = Math.min(MAX_SHIELDS_CAP, (user.shields ?? 0) + reward.shields);
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

// Event types that GRANT rewards.
const GRANT_EVENT_TYPES = new Set([
  'INITIAL_PURCHASE',
  'NON_RENEWING_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
]);

// Event types that REVOKE rewards. RC sends `CANCELLATION` for consumable
// refunds; `REFUND` and `EXPIRATION` for completeness. Subscriptions aren't
// in scope today but the table is here so we don't no-op when they ship.
const REFUND_EVENT_TYPES = new Set([
  'CANCELLATION',
  'REFUND',
  'EXPIRATION',
  'SUBSCRIPTION_PAUSED',
]);

// Abuse heuristic: if a player has accumulated this much refunded stardust,
// flag the account. Future stardust purchases for flagged accounts are
// refused (still 200 OK to RC) so we don't keep granting + refunding in a
// loop. Other rewards continue to flow — flagging is a soft signal, not a
// ban.
const REFUND_FLAG_STARDUST_THRESHOLD = 5_000;

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

    const isGrant  = GRANT_EVENT_TYPES.has(event.type);
    const isRefund = REFUND_EVENT_TYPES.has(event.type);
    if (!isGrant && !isRefund) {
      functions.logger.info(`revenueCatWebhook: skip non-actionable event ${event.type}`);
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
      if (isRefund) {
        const result = await applyRefund(uid, productId, txnId, txnRef, userRef, event.type);
        functions.logger.info(`revenueCatWebhook: refund ${result.reason} ${productId} for ${uid}`);
        res.status(200).send('ok');
        return;
      }

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

        // Refund-abuse gate: a flagged account loses access to stardust grants
        // (the only currency without a clawback ceiling) but other purchases
        // still flow. Keeps the gate soft — players can recover by contacting
        // support and getting the flag cleared.
        if (user.refundFlagged === true && packReward.stardust) {
          functions.logger.warn(`revenueCatWebhook: blocked stardust grant for flagged user ${uid}`);
          tx.set(txnRef, {
            uid,
            productId,
            transactionId: txnId,
            eventType: event.type,
            blocked: 'refund-flagged',
            appliedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
          return { applied: false, reason: 'refund-flagged' as const };
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
          refunded: false,
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

// ---------------------------------------------------------------------------
// Refund clawback (called from revenueCatWebhook on CANCELLATION/REFUND/etc.)
//
// Reads the original iapTransactions/{txnId} doc to find what was granted,
// then reverses the grant inside a single Firestore transaction:
//
// • numeric resources are clamped at 0 — players can never owe credits
// • cosmetic IDs are arrayRemoved from ownedCosmetics (idempotent if absent)
// • a refund counter accumulates on the user doc; over the abuse threshold
//   the account is flagged and future stardust packs are refused
// • the transaction doc gets refunded=true so a duplicate refund is a no-op
// ---------------------------------------------------------------------------

async function applyRefund(
  uid: string,
  productId: string,
  txnId: string,
  txnRef: admin.firestore.DocumentReference,
  userRef: admin.firestore.DocumentReference,
  eventType: string,
): Promise<{ applied: boolean; reason: string }> {
  return db.runTransaction(async (tx) => {
    const txnSnap = await tx.get(txnRef);
    if (!txnSnap.exists) {
      // RC sometimes sends a refund for a grant we never recorded (sandbox
      // weirdness, or a manual refund predating webhook config). Persist a
      // breadcrumb but don't try to reverse anything.
      tx.set(txnRef, {
        uid,
        productId,
        transactionId: txnId,
        eventType,
        refunded: true,
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        note: 'orphan-refund',
      });
      return { applied: false, reason: 'orphan' };
    }

    const txn = txnSnap.data() as admin.firestore.DocumentData;
    if (txn.refunded === true) {
      return { applied: false, reason: 'already-refunded' };
    }

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) {
      // No user doc to claw back from. Mark the transaction so we don't loop.
      tx.update(txnRef, {
        refunded: true,
        refundedAt: admin.firestore.FieldValue.serverTimestamp(),
        note: 'no-user-doc',
      });
      return { applied: false, reason: 'no-user' };
    }
    const user = userSnap.data() as admin.firestore.DocumentData;

    const packReward: PackReward | null = txn.packReward ?? null;
    const cosmeticGrants: string[] = Array.isArray(txn.cosmeticGrants) ? txn.cosmeticGrants : [];

    const update: admin.firestore.DocumentData = {};

    if (packReward) {
      // Clamp every numeric subtraction at 0 — the wallet can't go negative,
      // even if the player has already spent the refunded currency. The cost
      // of this abuse is bounded by the cumulative-refund flag.
      if (packReward.credits)  update.credits  = Math.max(0, (user.credits  ?? 0) - packReward.credits);
      if (packReward.stardust) update.stardust = Math.max(0, (user.stardust ?? 0) - packReward.stardust);
      if (packReward.fuel)     update.attacks  = Math.max(0, (user.attacks  ?? 0) - packReward.fuel);
      if (packReward.boost)    update.raids    = Math.max(0, (user.raids    ?? 0) - packReward.boost);
      if (packReward.shields)  update.shields  = Math.max(0, (user.shields  ?? 0) - packReward.shields);
      // spinRefill is consumed at grant time; no rollback possible. Skip.
    }

    if (cosmeticGrants.length > 0) {
      update.ownedCosmetics = admin.firestore.FieldValue.arrayRemove(...cosmeticGrants);
    }

    // Track cumulative refunded stardust; cross the threshold → flag the
    // account. Once flagged, future stardust grants are blocked in the
    // grant path until support clears the flag.
    const refundedStardustNow = packReward?.stardust ?? 0;
    if (refundedStardustNow > 0) {
      const prev = (user.refundedStardustTotal as number | undefined) ?? 0;
      const total = prev + refundedStardustNow;
      update.refundedStardustTotal = total;
      if (total >= REFUND_FLAG_STARDUST_THRESHOLD && !user.refundFlagged) {
        update.refundFlagged = true;
        update.refundFlaggedAt = admin.firestore.FieldValue.serverTimestamp();
      }
    }
    update.refundCount = ((user.refundCount as number | undefined) ?? 0) + 1;
    update.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    tx.update(userRef, update);
    tx.update(txnRef, {
      refunded: true,
      refundedAt: admin.firestore.FieldValue.serverTimestamp(),
      refundEventType: eventType,
    });

    return { applied: true, reason: 'ok' };
  });
}

// ---------------------------------------------------------------------------
// claimDailyReward — callable, validates streak server-side
//
// Streak logic:
//   • first claim → streak = 1
//   • next claim within 24h of last → rejected (too early)
//   • next claim 24h–48h after last → streak + 1
//   • next claim past 48h → streak resets to 1
//
// Reward cycles on a 7-day table; every 7th day adds milestone stardust.
// Days past 7 keep cycling (day 8 reward = day 1 reward) but `dailyClaimStreak`
// keeps climbing so the UI can flex the long-streak count.
// ---------------------------------------------------------------------------

const DAILY_CLAIM_WINDOW_MIN_MS = 22 * 60 * 60 * 1000; // 22h slack for timezone drift
const DAILY_CLAIM_WINDOW_MAX_MS = 48 * 60 * 60 * 1000; // past 48h → streak resets

interface DailyReward {
  credits?: number;
  stardust?: number;
  fuel?: number;
  boost?: number;
  shields?: number;
  spinRefill?: boolean;
}

const DAILY_REWARDS: Record<number, DailyReward> = {
  1: { credits: 200 },
  2: { credits: 400,  fuel: 1 },
  3: { credits: 600,  boost: 1 },
  4: { credits: 1000, shields: 2 },
  5: { credits: 1500, stardust: 5 },
  6: { credits: 2200, fuel: 2, boost: 2 },
  7: { credits: 5000, stardust: 20, spinRefill: true },
};

function dailyRewardForStreak(streak: number): DailyReward {
  const slot = ((streak - 1) % 7) + 1;
  const base = DAILY_REWARDS[slot];
  if (!base) return { credits: 200 };
  // Weekly bonus stardust on every 7th day past the first cycle:
  // day 14 +5, day 21 +10, day 28 +15, capped.
  if (slot === 7 && streak > 7) {
    const weeksPast = Math.floor((streak - 1) / 7);
    const bonus = Math.min(50, weeksPast * 5);
    return { ...base, stardust: (base.stardust ?? 0) + bonus };
  }
  return base;
}

export const claimDailyReward = functions.https.onCall(async (_data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign-in required.');
  }
  const uid = context.auth.uid;
  const userRef = db.doc(`users/${uid}`);

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'User doc missing.');
    }
    const user = snap.data() as admin.firestore.DocumentData;

    const now = Date.now();
    const lastAt: number = (user.lastDailyClaimAt as number | undefined) ?? 0;
    const prevStreak: number = (user.dailyClaimStreak as number | undefined) ?? 0;
    const elapsed = now - lastAt;

    if (lastAt > 0 && elapsed < DAILY_CLAIM_WINDOW_MIN_MS) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        `Daily reward not ready (${Math.ceil((DAILY_CLAIM_WINDOW_MIN_MS - elapsed) / 1000)}s)`,
      );
    }

    const newStreak = (lastAt === 0 || elapsed > DAILY_CLAIM_WINDOW_MAX_MS) ? 1 : prevStreak + 1;
    const reward = dailyRewardForStreak(newStreak);

    const update: admin.firestore.DocumentData = {
      lastDailyClaimAt: now,
      dailyClaimStreak: newStreak,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (reward.credits)  update.credits  = (user.credits  ?? 0) + reward.credits;
    if (reward.stardust) update.stardust = (user.stardust ?? 0) + reward.stardust;
    if (reward.fuel)     update.attacks  = Math.min(MAX_FUEL_CAP,    (user.attacks ?? 0) + reward.fuel);
    if (reward.boost)    update.raids    = Math.min(MAX_BOOST_CAP,   (user.raids   ?? 0) + reward.boost);
    if (reward.shields)  update.shields  = Math.min(MAX_SHIELDS_CAP, (user.shields ?? 0) + reward.shields);
    if (reward.spinRefill) {
      update.spinsRemaining  = MAX_SPINS_CAP;
      update.spinRefillStart = 0;
    }

    tx.update(userRef, update);
    return { streak: newStreak, reward, claimedAt: now };
  });
});

// ---------------------------------------------------------------------------
// notifyBuildComplete — push when a build job clears
//
// Watches habitats/{habitatId} for the activeBuildJob field transitioning
// from non-null to null. Fires a single push to the habitat owner. We don't
// need a cooldown here: builds at high tiers take 12–72h so the frequency
// is naturally bounded.
// ---------------------------------------------------------------------------

export const notifyBuildComplete = functions.firestore
  .document('habitats/{habitatId}')
  .onUpdate(async (change) => {
    const before = change.before.data() as HabitatDoc;
    const after  = change.after.data()  as HabitatDoc;
    const hadJob = before.activeBuildJob != null;
    const hasJob = after.activeBuildJob  != null;
    if (!(hadJob && !hasJob)) return; // only fire on the falling edge

    const ownerUid = after.ownerUid;
    if (!ownerUid) return;
    const prevJob = before.activeBuildJob;
    if (!prevJob) return;
    const label = prevJob.isOutpost
      ? `Outpost Lv ${prevJob.targetLevel}`
      : `${prevJob.type} Lv ${prevJob.targetLevel}`;
    await pushToUser(
      ownerUid,
      'BUILD COMPLETE',
      `${label} is online. Tap to claim.`,
      { type: 'build-complete' },
    );
  });
