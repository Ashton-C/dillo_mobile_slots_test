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
  // C.2 sector_specialist: the client passes whether the target is in the
  // attacker's currently-selected SectorMap sector. Cheatable like all
  // client state, but the bonus is modest.
  sectorMatch?: boolean;
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
  // + activeReelCardSpinsLeft; Phase C reads cards[cardId] in resolveCombat
  // and writes vengeanceTargets on the defender after a winning raid.
  cards?: Record<string, number>;
  activeReelCard?: string | null;
  activeReelCardSpinsLeft?: number;
  // Map of attacker UID → unix ms when the 15-min vengeance window expires.
  // The server sets it on a successful incoming raid and clears entries on
  // consumption (or natural expiry on read).
  vengeanceTargets?: Record<string, number>;
  // C.2: pursuit_beacon stores the next-raid bonus against a specific target
  // here. Single-use; cleared on consumption or natural expiry.
  pursuitTargets?: Record<string, { expiresAt: number; bonusPct: number }>;
  // C.2: vengeance_cast card reads this 24h map of recent attackers. Server
  // writes an entry on every successful incoming raid against this user.
  recentAttackers?: Record<string, number>;
  spinsRemaining?: number;
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
// Raid card effects (Phase C) — kept in sync with src/models/Card.ts.
//
// Only card ids in this map are actually applied; cards whose effect kinds
// the apply switch doesn't handle (multi-step / mini-game / smoke-screen
// stuff) live in the client catalog but never drop because
// CardService.IMPLEMENTED_RAID_EFFECT_KINDS filters them out.
//
// MUST stay in sync with src/models/Card.ts. If you add a raid card or
// change its effect, mirror it here.
// ---------------------------------------------------------------------------

type RaidEffect =
  | { kind: 'raid_power_delta'; delta: number }
  | { kind: 'raid_defender_power_delta'; delta: number }
  | { kind: 'raid_bust_to_power'; power: number }
  | { kind: 'raid_loot_multiplier'; multiplier: number }
  | { kind: 'raid_vault_ignore'; pct: number }
  | { kind: 'raid_tax_collector'; perVaultLevelPct: number }
  | { kind: 'raid_smash_grab'; lootBonusPct: number; powerPenalty: number }
  | { kind: 'raid_token_refund_on_win'; tokens: number }
  | { kind: 'raid_token_refund_on_loss_pct'; pct: number }
  | { kind: 'raid_no_consume_on_bust' }
  | { kind: 'raid_no_consume_on_loss' }
  | { kind: 'raid_disable_turret_on_jackpot'; hours: number }
  | { kind: 'raid_sabotage_spins_on_win'; pct: number }
  | { kind: 'raid_power_per_turret_charge'; perCharge: number }
  | { kind: 'raid_ignore_turret_charges'; count: number }
  | { kind: 'raid_all_in'; multiplier: number }
  | { kind: 'raid_wager'; stake: number; payoutMultiplier: number }
  | { kind: 'raid_lucky_range'; range: [number, number]; lootBonusPct: number }
  | { kind: 'raid_loss_penalty_bonus'; extraPct: number }
  | { kind: 'raid_threat_index'; perLevel: number }
  | { kind: 'raid_cooldown_bypass'; lootPenaltyPct: number }
  | { kind: 'raid_drone_synergy'; perDronePct: number }
  | { kind: 'raid_drone_disrupt'; scope: 'raider_only' | 'all' }
  | { kind: 'raid_smoke_screen'; hours: number }
  | { kind: 'raid_pursuit_beacon'; minutes: number; lootBonusPct: number }
  | { kind: 'raid_extra_token_cost'; extraTokens: number; powerBonus: number }
  | { kind: 'raid_anomaly_shift'; mode: 'previous' | 'best' }
  | { kind: 'raid_sector_specialist'; powerBonus: number; lootBonusPct: number }
  | { kind: 'raid_vengeance_bonus'; powerBonus: number; windowMs: number };

const RAID_CARD_EFFECTS: Record<string, RaidEffect> = {
  surge_core_minor:        { kind: 'raid_power_delta', delta: 15 },
  surge_core_major:        { kind: 'raid_power_delta', delta: 30 },
  wildfire_minor:          { kind: 'raid_bust_to_power', power: 40 },
  wildfire_major:          { kind: 'raid_bust_to_power', power: 80 },
  power_drain_minor:       { kind: 'raid_defender_power_delta', delta: -10 },
  power_drain_major:       { kind: 'raid_defender_power_delta', delta: -20 },
  vault_cracker_minor:     { kind: 'raid_vault_ignore', pct: 0.25 },
  vault_cracker_major:     { kind: 'raid_vault_ignore', pct: 0.5 },
  smash_grab_minor:        { kind: 'raid_smash_grab', lootBonusPct: 0.15, powerPenalty: 0 },
  smash_grab_major:        { kind: 'raid_smash_grab', lootBonusPct: 0.35, powerPenalty: 5 },
  tax_collector_minor:     { kind: 'raid_tax_collector', perVaultLevelPct: 0.05 },
  tax_collector_major:     { kind: 'raid_tax_collector', perVaultLevelPct: 0.10 },
  hostile_takeover_minor:  { kind: 'raid_disable_turret_on_jackpot', hours: 4 },
  hostile_takeover_major:  { kind: 'raid_disable_turret_on_jackpot', hours: 6 },
  sabotage_minor:          { kind: 'raid_sabotage_spins_on_win', pct: 0.05 },
  sabotage_major:          { kind: 'raid_sabotage_spins_on_win', pct: 0.10 },
  mirror_shield_minor:     { kind: 'raid_token_refund_on_loss_pct', pct: 0.5 },
  mirror_shield_major:     { kind: 'raid_token_refund_on_loss_pct', pct: 1.0 },
  phantom_strike_minor:    { kind: 'raid_no_consume_on_bust' },
  phantom_strike_major:    { kind: 'raid_no_consume_on_loss' },
  drone_disruptor_minor:   { kind: 'raid_drone_disrupt', scope: 'raider_only' },
  drone_disruptor_major:   { kind: 'raid_drone_disrupt', scope: 'all' },
  power_sponge_minor:      { kind: 'raid_power_per_turret_charge', perCharge: 5 },
  power_sponge_major:      { kind: 'raid_power_per_turret_charge', perCharge: 10 },
  cloak_jammer_minor:      { kind: 'raid_ignore_turret_charges', count: 1 },
  cloak_jammer_major:      { kind: 'raid_ignore_turret_charges', count: 2 },
  all_in_minor:            { kind: 'raid_all_in', multiplier: 2 },
  all_in_major:            { kind: 'raid_all_in', multiplier: 3 },
  wager_minor:             { kind: 'raid_wager', stake: 500,  payoutMultiplier: 1.5 },
  wager_major:             { kind: 'raid_wager', stake: 2000, payoutMultiplier: 2 },
  lucky_seven_minor:       { kind: 'raid_lucky_range', range: [70, 79], lootBonusPct: 0.5 },
  lucky_seven_major:       { kind: 'raid_lucky_range', range: [60, 89], lootBonusPct: 1.0 },
  adrenal_spike_minor:     { kind: 'raid_loss_penalty_bonus', extraPct: 0.5 },
  adrenal_spike_major:     { kind: 'raid_loss_penalty_bonus', extraPct: 0.75 },
  threat_index_minor:      { kind: 'raid_threat_index', perLevel: 10 },
  threat_index_major:      { kind: 'raid_threat_index', perLevel: 20 },
  cooldown_cracker_minor:  { kind: 'raid_cooldown_bypass', lootPenaltyPct: 0.25 },
  cooldown_cracker_major:  { kind: 'raid_cooldown_bypass', lootPenaltyPct: 0 },
  synergy_link_minor:      { kind: 'raid_drone_synergy', perDronePct: 0.10 },
  synergy_link_major:      { kind: 'raid_drone_synergy', perDronePct: 0.20 },
  skim_off_minor:          { kind: 'raid_token_refund_on_win', tokens: 1 },
  skim_off_major:          { kind: 'raid_token_refund_on_win', tokens: 2 },
  // C.2 additions
  smoke_screen_minor:      { kind: 'raid_smoke_screen', hours: 1 },
  smoke_screen_major:      { kind: 'raid_smoke_screen', hours: 4 },
  pursuit_beacon_minor:    { kind: 'raid_pursuit_beacon', minutes: 30, lootBonusPct: 0.20 },
  pursuit_beacon_major:    { kind: 'raid_pursuit_beacon', minutes: 60, lootBonusPct: 0.20 },
  twin_strike_minor:       { kind: 'raid_extra_token_cost', extraTokens: 1, powerBonus: 15 },
  twin_strike_major:       { kind: 'raid_extra_token_cost', extraTokens: 2, powerBonus: 35 },
  anomaly_shift_minor:     { kind: 'raid_anomaly_shift', mode: 'previous' },
  anomaly_shift_major:     { kind: 'raid_anomaly_shift', mode: 'best' },
  sector_specialist_minor: { kind: 'raid_sector_specialist', powerBonus: 15, lootBonusPct: 0 },
  sector_specialist_major: { kind: 'raid_sector_specialist', powerBonus: 30, lootBonusPct: 0.20 },
  vengeance_cast_minor:    { kind: 'raid_vengeance_bonus', powerBonus: 20, windowMs: 24 * 3_600_000 },
  vengeance_cast_major:    { kind: 'raid_vengeance_bonus', powerBonus: 40, windowMs: 24 * 3_600_000 },
  wager_minor:             { kind: 'raid_wager', stake: 500,  payoutMultiplier: 1.5 },
  wager_major:             { kind: 'raid_wager', stake: 2000, payoutMultiplier: 2 },
};

// adrenal_spike majors stack a +power bonus on top of the loss penalty —
// represented as a second entry in the catalog. The server applies both via
// SECONDARY_RAID_EFFECTS where present.
const SECONDARY_RAID_EFFECTS: Record<string, RaidEffect> = {
  adrenal_spike_minor: { kind: 'raid_power_delta', delta: 25 },
  adrenal_spike_major: { kind: 'raid_power_delta', delta: 50 },
  skim_off_minor:      { kind: 'raid_power_delta', delta: -10 },
  skim_off_major:      { kind: 'raid_power_delta', delta: -20 },
};

interface CombatModifiers {
  attackerPowerDelta: number;
  defenderPowerDelta: number;
  bustToPower: number;             // 0 = no replacement
  lootMultiplier: number;
  vaultIgnorePct: number;
  taxPerVaultLevelPct: number;
  refundTokensOnWin: number;
  refundTokenPctOnLoss: number;
  noConsumeOnBust: boolean;
  noConsumeOnLoss: boolean;
  disableTurretOnJackpotHours: number;
  sabotageSpinsOnWinPct: number;
  powerPerTurretCharge: number;
  ignoreTurretCharges: number;
  allInMultiplier: number;
  wager: { stake: number; payoutMultiplier: number } | null;
  luckyRange: [number, number] | null;
  luckyLootBonus: number;
  lossPenaltyExtraPct: number;
  threatIndexPerLevel: number;
  cooldownBypass: boolean;
  cooldownLootPenalty: number;
  droneSynergyPerDronePct: number;
  droneDisruptScope: 'raider_only' | 'all' | null;
  // C.2 additions
  smokeScreenHours: number;
  pursuitBeacon: { minutes: number; lootBonusPct: number } | null;
  extraTokenPowerBonus: number;
  anomalyShiftMode: 'previous' | 'best' | null;
  sectorSpecialistPower: number;
  sectorSpecialistLootBonus: number;
  vengeanceBonus: { powerBonus: number; windowMs: number } | null;
}

function defaultCombatModifiers(): CombatModifiers {
  return {
    attackerPowerDelta: 0,
    defenderPowerDelta: 0,
    bustToPower: 0,
    lootMultiplier: 1,
    vaultIgnorePct: 0,
    taxPerVaultLevelPct: 0,
    refundTokensOnWin: 0,
    refundTokenPctOnLoss: 0,
    noConsumeOnBust: false,
    noConsumeOnLoss: false,
    disableTurretOnJackpotHours: 0,
    sabotageSpinsOnWinPct: 0,
    powerPerTurretCharge: 0,
    ignoreTurretCharges: 0,
    allInMultiplier: 1,
    wager: null,
    luckyRange: null,
    luckyLootBonus: 0,
    lossPenaltyExtraPct: 0,
    threatIndexPerLevel: 0,
    cooldownBypass: false,
    cooldownLootPenalty: 0,
    droneSynergyPerDronePct: 0,
    droneDisruptScope: null,
    smokeScreenHours: 0,
    pursuitBeacon: null,
    extraTokenPowerBonus: 0,
    anomalyShiftMode: null,
    sectorSpecialistPower: 0,
    sectorSpecialistLootBonus: 0,
    vengeanceBonus: null,
  };
}

function applyRaidEffect(mods: CombatModifiers, effect: RaidEffect): void {
  switch (effect.kind) {
    case 'raid_power_delta':              mods.attackerPowerDelta += effect.delta; break;
    case 'raid_defender_power_delta':     mods.defenderPowerDelta += effect.delta; break;
    case 'raid_bust_to_power':            mods.bustToPower = effect.power; break;
    case 'raid_loot_multiplier':          mods.lootMultiplier *= effect.multiplier; break;
    case 'raid_vault_ignore':             mods.vaultIgnorePct = effect.pct; break;
    case 'raid_tax_collector':            mods.taxPerVaultLevelPct = effect.perVaultLevelPct; break;
    case 'raid_smash_grab':
      mods.lootMultiplier *= (1 + effect.lootBonusPct);
      mods.attackerPowerDelta -= effect.powerPenalty;
      break;
    case 'raid_token_refund_on_win':      mods.refundTokensOnWin = effect.tokens; break;
    case 'raid_token_refund_on_loss_pct': mods.refundTokenPctOnLoss = effect.pct; break;
    case 'raid_no_consume_on_bust':       mods.noConsumeOnBust = true; break;
    case 'raid_no_consume_on_loss':       mods.noConsumeOnLoss = true; break;
    case 'raid_disable_turret_on_jackpot': mods.disableTurretOnJackpotHours = effect.hours; break;
    case 'raid_sabotage_spins_on_win':    mods.sabotageSpinsOnWinPct = effect.pct; break;
    case 'raid_power_per_turret_charge':  mods.powerPerTurretCharge = effect.perCharge; break;
    case 'raid_ignore_turret_charges':    mods.ignoreTurretCharges = effect.count; break;
    case 'raid_all_in':                   mods.allInMultiplier = effect.multiplier; break;
    case 'raid_wager':                    mods.wager = { stake: effect.stake, payoutMultiplier: effect.payoutMultiplier }; break;
    case 'raid_lucky_range':
      mods.luckyRange = effect.range;
      mods.luckyLootBonus = effect.lootBonusPct;
      break;
    case 'raid_loss_penalty_bonus':       mods.lossPenaltyExtraPct = effect.extraPct; break;
    case 'raid_threat_index':             mods.threatIndexPerLevel = effect.perLevel; break;
    case 'raid_cooldown_bypass':
      mods.cooldownBypass = true;
      mods.cooldownLootPenalty = effect.lootPenaltyPct;
      break;
    case 'raid_drone_synergy':            mods.droneSynergyPerDronePct = effect.perDronePct; break;
    case 'raid_drone_disrupt':            mods.droneDisruptScope = effect.scope; break;
    case 'raid_smoke_screen':             mods.smokeScreenHours = effect.hours; break;
    case 'raid_pursuit_beacon':           mods.pursuitBeacon = { minutes: effect.minutes, lootBonusPct: effect.lootBonusPct }; break;
    case 'raid_extra_token_cost':         mods.extraTokenPowerBonus = effect.powerBonus; break;
    case 'raid_anomaly_shift':            mods.anomalyShiftMode = effect.mode; break;
    case 'raid_sector_specialist':
      mods.sectorSpecialistPower = effect.powerBonus;
      mods.sectorSpecialistLootBonus = effect.lootBonusPct;
      break;
    case 'raid_vengeance_bonus':          mods.vengeanceBonus = { powerBonus: effect.powerBonus, windowMs: effect.windowMs }; break;
  }
}

function resolveRaidCardModifiers(cardId: string | undefined): CombatModifiers {
  const mods = defaultCombatModifiers();
  if (!cardId) return mods;
  const primary = RAID_CARD_EFFECTS[cardId];
  if (!primary) return mods;
  applyRaidEffect(mods, primary);
  const secondary = SECONDARY_RAID_EFFECTS[cardId];
  if (secondary) applyRaidEffect(mods, secondary);
  return mods;
}

// 15-minute vengeance window. Stored as a map on the defender's user doc
// (`vengeanceTargets: { [attackerUid]: expiresAt }`) when an attack wins.
// The next time the original defender raids the original attacker within
// the window, the cooldown is bypassed and loot is bumped +50%.
const VENGEANCE_WINDOW_MS = 15 * 60 * 1000;
const VENGEANCE_LOOT_BONUS = 0.5;

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
    const { attackerUid, defenderUid, type } = request;
    let attackerPower = request.attackerPower;
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

      // --- Resolve raid card modifiers + validate inventory ---
      // The cardId on the request is optimistic — the client may have written
      // it without actually owning the card. We validate against the server
      // copy of the attacker's inventory before applying any effect.
      const requestCardId = request.cardId;
      const ownsRequestedCard =
        !!requestCardId && (attacker.cards?.[requestCardId] ?? 0) > 0;
      const effectiveCardId = ownsRequestedCard ? requestCardId : undefined;
      const cardMods = resolveRaidCardModifiers(effectiveCardId);
      // Track this attacker's card-consumption write here so every outcome
      // branch flushes the decrement atomically with its credit/spin writes.
      const cardDecrementUpdate = (): admin.firestore.UpdateData<UserDoc> => {
        if (!effectiveCardId) return {};
        return ({ [`cards.${effectiveCardId}`]: admin.firestore.FieldValue.increment(-1) } as admin.firestore.UpdateData<UserDoc>);
      };

      // wildfire / bust_to_power: convert a 8-power bust into a real number.
      if (attackerPower === 8 && cardMods.bustToPower > 0) {
        attackerPower = cardMods.bustToPower;
      }
      attackerPower += cardMods.attackerPowerDelta;
      // twin_strike: client deducts the extra tokens at pick time; server
      // just applies the bonus.
      attackerPower += cardMods.extraTokenPowerBonus;
      // sector_specialist: client tags the request when target's sector
      // matches the player's currently-selected SectorMap sector.
      if (request.sectorMatch && cardMods.sectorSpecialistPower > 0) {
        attackerPower += cardMods.sectorSpecialistPower;
      }
      // vengeance_cast (card): +power vs anyone who raided you in the
      // window. Distinct from the global 15-min vengeance bypass.
      if (cardMods.vengeanceBonus) {
        const lastRaidedMeAt =
          (attacker.recentAttackers as Record<string, number> | undefined)?.[defenderUid] ?? 0;
        if (lastRaidedMeAt > 0 && Date.now() - lastRaidedMeAt < cardMods.vengeanceBonus.windowMs) {
          attackerPower += cardMods.vengeanceBonus.powerBonus;
        }
      }

      // --- Wager (raid_wager): pre-deduct stake from attacker credits.
      // Stake is forfeit on any non-cooldown outcome (turret-block, loss,
      // even win — though win adds it back × payoutMultiplier). If the
      // attacker can't afford the stake, the wager silently no-ops but
      // the card is still consumed.
      const wagerActive =
        !!cardMods.wager && attacker.credits >= cardMods.wager.stake;
      const wagerStake = wagerActive ? cardMods.wager!.stake : 0;
      const wagerPayoutMultiplier = wagerActive ? cardMods.wager!.payoutMultiplier : 0;
      const effectiveAttackerCredits = attacker.credits - wagerStake;

      // --- Vengeance check (consumed regardless of outcome) ---
      const vengeanceExpiry =
        (attacker.vengeanceTargets as Record<string, number> | undefined)?.[defenderUid] ?? 0;
      const isVengeance = vengeanceExpiry > Date.now();
      // After consumption the entry is dropped from the attacker's map so it
      // can't be reused — even a failed vengeance raid burns the window.
      const consumeVengeanceUpdate: admin.firestore.UpdateData<UserDoc> = isVengeance
        ? ({ [`vengeanceTargets.${defenderUid}`]: admin.firestore.FieldValue.delete() } as admin.firestore.UpdateData<UserDoc>)
        : {};

      // --- Attack cooldown ---
      const lastAttackedAt = defender.lastAttackedAt ?? 0;
      const inCooldown = lastAttackedAt > 0 && Date.now() - lastAttackedAt < ATTACK_COOLDOWN_MS;
      const cooldownBypass = isVengeance || cardMods.cooldownBypass;
      if (inCooldown && !cooldownBypass) {
        const refundField = type === 'INTRUSION' ? 'intrusions' : 'extractions';
        const refundedValue = ((attackerSnap.data()?.[refundField] as number | undefined) ?? 0) + 1;
        await Promise.all([
          db.doc(`users/${attackerUid}`).update({
            [refundField]: refundedValue,
            // Cooldown-blocked raids don't consume the raid card — refund it
            // by simply NOT decrementing here.
          }),
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

      // --- Defender habitat (TURRET + VAULT + outpost level) ---
      const defenderHabitat = await getHabitatForUser(defenderUid);
      const defBuildingLevels = defenderHabitat?.data.buildingLevels ?? {};
      const turretLevel = defBuildingLevels['TURRET'] ?? 0;
      const vaultLevel  = defBuildingLevels['VAULT']  ?? 0;

      // --- TURRET check ---
      // Hostile takeover card writes turretDisabledUntil on the habitat — if
      // that timer is still active the turret is offline regardless of charges.
      const turretDisabledUntil =
        (defenderHabitat?.data.turretDisabledUntil as number | undefined) ?? 0;
      const turretDisabled = turretDisabledUntil > Date.now();
      let blockedByTurret = false;
      if (
        turretLevel > 0
        && defenderHabitat
        && !turretDisabled
        && cardMods.ignoreTurretCharges <= 0
      ) {
        blockedByTurret = await consumeTurretCharge(
          defenderHabitat.id,
          defenderHabitat.data,
          turretLevel,
        );
      }
      // power_sponge: each charge the defender DID burn fuels the attacker.
      // We currently only know if THIS attack triggered a charge; sum the
      // gain for that single charge (good enough for v1).
      if (blockedByTurret) {
        attackerPower += cardMods.powerPerTurretCharge;
      }

      if (blockedByTurret) {
        // wager: stake is forfeit on any non-cooldown outcome (including
        // turret-block). effectiveAttackerCredits had the stake deducted.
        const turretAttackerUpdate: admin.firestore.UpdateData<UserDoc> = ({
          ...cardDecrementUpdate(),
          ...consumeVengeanceUpdate,
        } as admin.firestore.UpdateData<UserDoc>);
        if (wagerActive) turretAttackerUpdate.credits = effectiveAttackerCredits;
        await Promise.all([
          db.doc(`users/${defenderUid}`).update({ lastAttackedAt: Date.now() }),
          db.doc(`users/${attackerUid}`).update(turretAttackerUpdate),
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
            cardId: effectiveCardId ?? null,
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

      // --- Defender power (+ drone disrupt / threat index / smash & grab penalty) ---
      const defenderOutpostLevel = defenderHabitat?.data.outpostLevel ?? 1;
      let defenderPower =
        defenderOutpostLevel * 11 + 25 + Math.floor(Math.random() * 41);
      defenderPower += cardMods.defenderPowerDelta;

      // threat_index: bonus power per outpost level the defender exceeds the
      // attacker. Read attacker's outpost via habitat lookup.
      if (cardMods.threatIndexPerLevel > 0) {
        const attackerHab = await getHabitatForUser(attackerUid);
        const attackerOutpost = attackerHab?.data.outpostLevel ?? 1;
        const gap = Math.max(0, defenderOutpostLevel - attackerOutpost);
        attackerPower += gap * cardMods.threatIndexPerLevel;
      }

      const attackerWon = attackerPower > defenderPower;

      if (attackerWon) {
        const tier = powerToTier(attackerPower);
        const { pct, floor, ceil } = LOOT_TIER[tier];

        const [anomalySnap] = await Promise.all([db.doc('anomalies/current').get()]);
        const anomalyDoc = anomalySnap.exists ? anomalySnap.data() : undefined;
        const anomalyId = anomalyDoc?.id as string | undefined;
        const previousAnomalyId = anomalyDoc?.previousId as string | undefined;

        // anomaly_shift card: substitute the raid bonus from a different
        // anomaly. 'previous' = whichever was active 4h ago; 'best' = the
        // highest single-anomaly raid bonus (currently RAID_SHADOW at 50%).
        let effectiveAnomalyId = anomalyId;
        if (cardMods.anomalyShiftMode === 'previous' && previousAnomalyId) {
          if (anomalyRaidBonus(previousAnomalyId) > anomalyRaidBonus(anomalyId)) {
            effectiveAnomalyId = previousAnomalyId;
          }
        } else if (cardMods.anomalyShiftMode === 'best') {
          effectiveAnomalyId = 'RAID_SHADOW';
        }

        // Drone disrupt: zero out the attacker's RAIDER bonus when the card says so.
        const droneBonus = cardMods.droneDisruptScope
          ? 0
          : attackerDroneRaidBonus(attacker.activeDrones);
        const droneSynergyBonus =
          cardMods.droneSynergyPerDronePct * ((attacker.activeDrones?.length ?? 0));
        const totalRaidBonus = Math.min(
          1.0,
          anomalyRaidBonus(effectiveAnomalyId) + droneBonus + droneSynergyBonus,
        );

        const baseFromWallet = defender.credits * pct;
        const baseClamped    = Math.max(floor, Math.min(ceil, baseFromWallet));
        let baseBonused      = Math.floor(baseClamped * (1 + totalRaidBonus));

        // Card loot multipliers stack: all_in × smash_grab/tax_collector etc.
        let lootMult = cardMods.lootMultiplier * cardMods.allInMultiplier;
        if (cardMods.taxPerVaultLevelPct > 0) {
          lootMult *= (1 + cardMods.taxPerVaultLevelPct * vaultLevel);
        }
        if (cardMods.luckyRange) {
          const [lo, hi] = cardMods.luckyRange;
          if (attackerPower >= lo && attackerPower <= hi) {
            lootMult *= (1 + cardMods.luckyLootBonus);
          }
        }
        if (isVengeance) {
          lootMult *= (1 + VENGEANCE_LOOT_BONUS);
        }
        if (cardMods.cooldownBypass && cardMods.cooldownLootPenalty > 0 && inCooldown) {
          lootMult *= (1 - cardMods.cooldownLootPenalty);
        }
        // sector_specialist: extra loot when raiding in the player's
        // current sector.
        if (request.sectorMatch && cardMods.sectorSpecialistLootBonus > 0) {
          lootMult *= (1 + cardMods.sectorSpecialistLootBonus);
        }
        // pursuit_beacon: consume a mark set by a prior raid on this target.
        // The card itself doesn't apply a bonus to its OWN raid — it sets
        // the mark for a future one. The bonus only fires when a beacon
        // mark from a *previous* raid is still live.
        const existingBeacon =
          (attacker.pursuitTargets as Record<string, { expiresAt: number; bonusPct: number }> | undefined)
            ?.[defenderUid];
        const beaconActive = !!existingBeacon && existingBeacon.expiresAt > Date.now();
        if (beaconActive && existingBeacon) {
          lootMult *= (1 + existingBeacon.bonusPct);
        }
        baseBonused = Math.floor(baseBonused * lootMult);

        // vault_cracker / vault_ignore: subtract the bypassed portion from
        // the standard reduction floor. Reduction is still floored at 0.
        const baseReduction = vaultReduction(vaultLevel);
        const reduction = Math.max(0, baseReduction - cardMods.vaultIgnorePct);
        const creditsLost = Math.floor(baseBonused * (1 - reduction));
        const transferred = Math.min(creditsLost, defender.credits);

        const isJackpotPower = attackerPower >= 130;
        const turretDisableHours =
          isJackpotPower ? cardMods.disableTurretOnJackpotHours : 0;

        // sabotage on win: deduct a fraction of the defender's stored spins.
        const sabotageSpins =
          cardMods.sabotageSpinsOnWinPct > 0
            ? Math.floor((defender.spinsRemaining ?? 0) * cardMods.sabotageSpinsOnWinPct)
            : 0;

        const wagerWinBonus = wagerActive ? Math.floor(wagerStake * wagerPayoutMultiplier) : 0;
        const defenderNewCredits = defender.credits - transferred;
        const attackerNewCredits = effectiveAttackerCredits + transferred + wagerWinBonus;

        // refund tokens on win (skim_off): bump the appropriate token by N.
        const refundField = type === 'INTRUSION' ? 'intrusions' : 'extractions';
        const refundTokens = cardMods.refundTokensOnWin;
        const attackerUpdate: admin.firestore.UpdateData<UserDoc> = ({
          credits: attackerNewCredits,
          ...cardDecrementUpdate(),
          ...consumeVengeanceUpdate,
        } as admin.firestore.UpdateData<UserDoc>);
        if (refundTokens > 0) {
          attackerUpdate[refundField] =
            ((attackerSnap.data()?.[refundField] as number | undefined) ?? 0) + refundTokens;
        }
        // pursuit_beacon: consume the existing mark (if any) and set the
        // new one when the current raid was launched with the card.
        if (beaconActive) {
          (attackerUpdate as Record<string, unknown>)[`pursuitTargets.${defenderUid}`] =
            admin.firestore.FieldValue.delete();
        }
        if (cardMods.pursuitBeacon) {
          (attackerUpdate as Record<string, unknown>)[`pursuitTargets.${defenderUid}`] = {
            expiresAt: Date.now() + cardMods.pursuitBeacon.minutes * 60 * 1000,
            bonusPct: cardMods.pursuitBeacon.lootBonusPct,
          };
        }

        const defenderUpdate: admin.firestore.UpdateData<UserDoc> = ({
          credits: defenderNewCredits,
          lastAttackedAt: Date.now(),
          // 15-min vengeance window so the defender can retaliate.
          [`vengeanceTargets.${attackerUid}`]: Date.now() + VENGEANCE_WINDOW_MS,
          // 24h recentAttackers map for the vengeance_cast card.
          [`recentAttackers.${attackerUid}`]: Date.now(),
        } as admin.firestore.UpdateData<UserDoc>);
        if (sabotageSpins > 0) {
          defenderUpdate.spinsRemaining = Math.max(
            0,
            (defender.spinsRemaining ?? 0) - sabotageSpins,
          );
        }

        const habitatUpdate: admin.firestore.UpdateData<HabitatDoc> = {};
        if (turretDisableHours > 0 && defenderHabitat) {
          habitatUpdate.turretDisabledUntil =
            Date.now() + turretDisableHours * 3_600_000;
        }

        // smoke_screen: tag the defender's event so the client combat log
        // hides it until the cloak expires; suppress the push entirely so
        // the defender doesn't get a notification either.
        const smokeMs = cardMods.smokeScreenHours * 3_600_000;
        const defenderEvent: Record<string, unknown> = {
          type: type === 'INTRUSION' ? 'ATTACK_RESOLVED' : 'RAID_RESOLVED',
          fromUid: attackerUid,
          fromDisplayName: attacker.displayName,
          attackerWon: true,
          creditsLost: transferred,
        };
        if (smokeMs > 0) defenderEvent.hideUntil = Date.now() + smokeMs;

        await Promise.all([
          db.doc(`users/${defenderUid}`).update(defenderUpdate),
          db.doc(`users/${attackerUid}`).update(attackerUpdate),
          ...(defenderHabitat && Object.keys(habitatUpdate).length > 0
            ? [db.doc(`habitats/${defenderHabitat.id}`).update(habitatUpdate)]
            : []),
          writeEvent(defenderUid, defenderEvent),
          writeEvent(attackerUid, {
            type: 'COMBAT_RESULT',
            fromUid: defenderUid,
            fromDisplayName: defender.displayName,
            attackerWon: true,
            creditsGained: transferred,
            vengeance: isVengeance,
            cardId: effectiveCardId ?? null,
          }),
          ...(smokeMs > 0
            ? [] // no push when smoke-screened
            : [pushToUser(
                defenderUid,
                type === 'INTRUSION' ? 'INCURSION DETECTED' : 'OUTPOST RAIDED',
                `${attacker.displayName} took ${transferred.toLocaleString()} CR. You have 15 min to retaliate.`,
                { type: 'attack-won', attackerUid, creditsLost: transferred },
              )]),
        ]);

        await requestRef.update({
          status: 'RESOLVED',
          outcome: 'ATTACKER_WON',
          creditsLost: transferred,
          creditsGained: transferred,
          vaultReduction: reduction,
          anomalyBonus: anomalyRaidBonus(anomalyId),
          droneBonus,
          vengeance: isVengeance,
          cardId: effectiveCardId ?? null,
        });
      } else {
        // Defender won. Refund the token if mirror_shield says to; consume
        // it normally otherwise. No-consume-on-bust beats no-consume-on-loss
        // when both apply (only one card is active per raid anyway).
        const refundField = type === 'INTRUSION' ? 'intrusions' : 'extractions';
        const tokenBefore = (attackerSnap.data()?.[refundField] as number | undefined) ?? 0;
        const skipConsume =
          (cardMods.noConsumeOnBust && attackerPower <= 8) || cardMods.noConsumeOnLoss;
        const tokenRefundFraction = cardMods.refundTokenPctOnLoss;
        let tokenAfter = tokenBefore;
        if (skipConsume) {
          tokenAfter = tokenBefore + 1; // already deducted client-side; give it back
        } else if (tokenRefundFraction > 0 && Math.random() < tokenRefundFraction) {
          // Fractional refund → probabilistic full-token refund. mirror_shield
          // minor (0.5) lands 50% of the time, major (1.0) always.
          tokenAfter = tokenBefore + 1;
        }

        // adrenal_spike on loss: defender gains a slice of the attacker's
        // credits as bonus penalty (extraPct of the standard loot floor).
        let bonusToDefender = 0;
        if (cardMods.lossPenaltyExtraPct > 0) {
          const tier = powerToTier(attackerPower);
          const floorAmt = LOOT_TIER[tier].floor;
          bonusToDefender = Math.min(
            attacker.credits,
            Math.floor(floorAmt * cardMods.lossPenaltyExtraPct),
          );
        }

        // wager: stake is forfeit on loss. effectiveAttackerCredits already
        // had the stake deducted; commit it now if no other CR write fires.
        const attackerCreditsAfterLoss = wagerActive
          ? Math.max(0, effectiveAttackerCredits - bonusToDefender)
          : Math.max(0, attacker.credits - bonusToDefender);

        const attackerUpdate: admin.firestore.UpdateData<UserDoc> = ({
          ...cardDecrementUpdate(),
          ...consumeVengeanceUpdate,
        } as admin.firestore.UpdateData<UserDoc>);
        if (tokenAfter !== tokenBefore) attackerUpdate[refundField] = tokenAfter;
        if (bonusToDefender > 0 || wagerActive) {
          attackerUpdate.credits = attackerCreditsAfterLoss;
        }

        const defenderUpdate: admin.firestore.UpdateData<UserDoc> = {
          lastAttackedAt: Date.now(),
        };
        if (bonusToDefender > 0) {
          defenderUpdate.credits = defender.credits + bonusToDefender;
        }

        // smoke_screen: tag and suppress push on loss too.
        const smokeMs = cardMods.smokeScreenHours * 3_600_000;
        const defenderEvent: Record<string, unknown> = {
          type: type === 'INTRUSION' ? 'ATTACK_RESOLVED' : 'RAID_RESOLVED',
          fromUid: attackerUid,
          fromDisplayName: attacker.displayName,
          attackerWon: false,
          creditsGained: bonusToDefender || undefined,
        };
        if (smokeMs > 0) defenderEvent.hideUntil = Date.now() + smokeMs;

        await Promise.all([
          db.doc(`users/${defenderUid}`).update(defenderUpdate),
          db.doc(`users/${attackerUid}`).update(attackerUpdate),
          writeEvent(defenderUid, defenderEvent),
          writeEvent(attackerUid, {
            type: 'COMBAT_RESULT',
            fromUid: defenderUid,
            fromDisplayName: defender.displayName,
            attackerWon: false,
            creditsLost: bonusToDefender || undefined,
            cardId: effectiveCardId ?? null,
          }),
          ...(smokeMs > 0
            ? []
            : [pushToUser(
                defenderUid,
                'ATTACK REPELLED',
                `${attacker.displayName} tried to raid you and bounced.`,
                { type: 'attack-repelled' },
              )]),
        ]);

        await requestRef.update({
          status: 'RESOLVED',
          outcome: 'DEFENDER_WON',
          cardId: effectiveCardId ?? null,
        });
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
      previousId,
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
