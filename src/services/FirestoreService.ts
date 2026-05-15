import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  addDoc,
  getDocs,
  limit,
  query,
  orderBy,
  where,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BuildingType, ActiveBuildJob } from '@/models/Habitat';

export interface HabitatSnapshot {
  buildingLevels: Partial<Record<BuildingType, number>>;
  activeBuildJob: ActiveBuildJob | null;
  outpostLevel?: number;
}

export interface UserResourceSnapshot {
  credits: number;
  // Premium build-skip currency. Defaults to 0 if the user doc predates
  // the field (legacy users) — treated as zero on read.
  stardust: number;
  attacks: number;
  raids: number;
  shields: number;
  intrusions: number;
  extractions: number;
  spinsRemaining: number;
  spinRefillStart: number; // unix ms, 0 when at max spins
  xp: number;
  level: number;
  // Daily streak — written by the claimDailyReward Cloud Function.
  lastDailyClaimAt: number;
  dailyClaimStreak: number;
  // Card system — Phase A data plumbing. `cards` is a sparse map of card id
  // → count; `activeReelCard` is the id queued for the next spin (cleared by
  // the server on consumption in Phase B). `activeReelCardSpinsLeft` is the
  // remaining spin count for multi-spin effects (Hot Streak, Tier Lock, etc.);
  // 0 or missing means consume on the next spin.
  cards: Record<string, number>;
  activeReelCard: string | null;
  activeReelCardSpinsLeft: number;
  // IAP-granted cosmetic IDs from the RevenueCat webhook. Server-authoritative
  // ownership; the client merges these into useCosmeticsStore on subscribe.
  ownedCosmetics?: string[];
}

export interface PlayerIndexEntry {
  uid: string;
  displayName: string;
  avatarColor: string;
  outpostLevel: number;
  level: number;
  updatedAt: unknown;
}

export interface GameEvent {
  id: string;
  type: 'ATTACK_INCOMING' | 'RAID_INCOMING' | 'ATTACK_RESOLVED' | 'RAID_RESOLVED' | 'COMBAT_RESULT';
  fromUid: string;
  fromDisplayName: string;
  creditsLost?: number;
  creditsGained?: number;
  attackerWon?: boolean;
  timestamp: number;
  read: boolean;
}

// Write resource deltas back to Firestore after a spin or action.
export async function writeUserResources(
  uid: string,
  data: Partial<UserResourceSnapshot>,
): Promise<void> {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

// Subscribe to real-time resource updates.
export function subscribeToUser(
  uid: string,
  onUpdate: (data: UserResourceSnapshot) => void,
): Unsubscribe {
  const ref = doc(db, 'users', uid);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      onUpdate({
        credits:           d.credits           ?? 0,
        stardust:          d.stardust          ?? 0,
        attacks:           d.attacks           ?? 0,
        raids:             d.raids             ?? 0,
        shields:           d.shields           ?? 0,
        intrusions:        d.intrusions        ?? 0,
        extractions:       d.extractions       ?? 0,
        spinsRemaining:    d.spinsRemaining    ?? 50,
        spinRefillStart:   d.spinRefillStart   ?? 0,
        xp:                d.xp                ?? 0,
        level:             d.level             ?? 1,
        lastDailyClaimAt:  d.lastDailyClaimAt  ?? 0,
        dailyClaimStreak:  d.dailyClaimStreak  ?? 0,
        cards:                     (d.cards && typeof d.cards === 'object') ? (d.cards as Record<string, number>) : {},
        activeReelCard:            typeof d.activeReelCard === 'string' ? d.activeReelCard : null,
        activeReelCardSpinsLeft:   typeof d.activeReelCardSpinsLeft === 'number' ? d.activeReelCardSpinsLeft : 0,
        ownedCosmetics:    Array.isArray(d.ownedCosmetics) ? (d.ownedCosmetics as string[]) : undefined,
      });
    },
    (err) => console.error('subscribeToUser error:', err),
  );
}

// Write or update the player's entry in the global player index (for radar/discovery).
export async function writePlayerIndex(
  uid: string,
  entry: Omit<PlayerIndexEntry, 'uid' | 'updatedAt'>,
): Promise<void> {
  const ref = doc(db, 'playerIndex', uid);
  await setDoc(ref, { uid, ...entry, updatedAt: serverTimestamp() }, { merge: true });
}

// Partial update — useful when only one field changes (e.g. outpostLevel after
// an upgrade completes) and we don't want to require the caller to look up the
// rest of the profile.
export async function writePlayerIndexPartial(
  uid: string,
  partial: Partial<Omit<PlayerIndexEntry, 'uid' | 'updatedAt'>>,
): Promise<void> {
  const ref = doc(db, 'playerIndex', uid);
  await setDoc(ref, { uid, ...partial, updatedAt: serverTimestamp() }, { merge: true });
}

// Fetch up to `count` opponents in a level band around `selfOutpostLevel`.
// Asymmetric on purpose — players can punch up further than they punch down.
// If the tight band is sparse (<3 hits), retry with a wider band before
// finally falling back to no filter so testers in low-population pools still
// get matches.
export async function fetchRadarTargets(
  selfUid: string,
  selfOutpostLevel: number,
  count = 5,
): Promise<PlayerIndexEntry[]> {
  const ref = collection(db, 'playerIndex');

  async function fetchBand(min: number, max: number): Promise<PlayerIndexEntry[]> {
    const q = query(
      ref,
      where('outpostLevel', '>=', min),
      where('outpostLevel', '<=', max),
      limit(30),
    );
    const snap = await getDocs(q);
    const out: PlayerIndexEntry[] = [];
    snap.forEach((d) => {
      if (d.id !== selfUid) out.push(d.data() as PlayerIndexEntry);
    });
    return out;
  }

  // Tight band: -2 / +3 levels.
  let candidates = await fetchBand(
    Math.max(1, selfOutpostLevel - 2),
    selfOutpostLevel + 3,
  );

  // Widen if tight band is sparse.
  if (candidates.length < 3) {
    candidates = await fetchBand(
      Math.max(1, selfOutpostLevel - 4),
      selfOutpostLevel + 5,
    );
  }

  // Last-ditch fallback so the radar isn't empty in dev / tiny pools.
  if (candidates.length === 0) {
    const q = query(ref, limit(count + 10));
    const snap = await getDocs(q);
    snap.forEach((d) => {
      if (d.id !== selfUid) candidates.push(d.data() as PlayerIndexEntry);
    });
  }

  // Shuffle then take `count` so repeat scans don't surface the same N.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, count);
}

// Write a combat request (Cloud Function resolves it).
export async function writeCombatRequest(data: {
  attackerUid: string;
  defenderUid: string;
  type: 'INTRUSION' | 'EXTRACTION';
  attackerPower: number;
}): Promise<string> {
  const ref = collection(db, 'combatRequests');
  const doc_ = await addDoc(ref, {
    ...data,
    status: 'PENDING',
    createdAt: serverTimestamp(),
  });
  return doc_.id;
}

export interface CombatRequestResolution {
  status: 'PENDING' | 'PROCESSING' | 'RESOLVED' | 'ERROR';
  outcome?: 'ATTACKER_WON' | 'DEFENDER_WON' | 'BLOCKED_BY_TURRET';
  creditsGained?: number;
  creditsLost?: number;
  vaultReduction?: number;
  anomalyBonus?: number;
  droneBonus?: number;
  error?: string;
}

// Subscribe to a single combatRequest doc so the launching mini-game can
// surface the actual server-resolved loot to the player.
export function subscribeToCombatRequest(
  requestId: string,
  onUpdate: (r: CombatRequestResolution) => void,
): Unsubscribe {
  const ref = doc(db, 'combatRequests', requestId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      onUpdate(snap.data() as CombatRequestResolution);
    },
    (err) => console.error('subscribeToCombatRequest error:', err),
  );
}

// Subscribe to the player's incoming events subcollection.
export function subscribeToEvents(
  uid: string,
  onEvent: (event: GameEvent, isInitialLoad: boolean) => void,
): Unsubscribe {
  const ref = collection(db, 'users', uid, 'events');
  const q = query(ref, orderBy('timestamp', 'desc'), limit(20));
  let firstSnapshot = true;
  return onSnapshot(
    q,
    (snap) => {
      const isInitial = firstSnapshot;
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const d = change.doc.data();
          onEvent({
            id:               change.doc.id,
            type:             d.type,
            fromUid:          d.fromUid ?? '',
            fromDisplayName:  d.fromDisplayName ?? 'Unknown',
            creditsLost:      d.creditsLost,
            creditsGained:    d.creditsGained,
            attackerWon:      d.attackerWon,
            timestamp:        d.timestamp ?? Date.now(),
            read:             d.read ?? false,
          }, isInitial);
        }
      });
      firstSnapshot = false;
    },
    (err) => console.error('subscribeToEvents error:', err),
  );
}

// Mark an event as read.
export async function markEventRead(uid: string, eventId: string): Promise<void> {
  const ref = doc(db, 'users', uid, 'events', eventId);
  await updateDoc(ref, { read: true });
}

// Ensure a habitat doc exists for the user.
export async function ensureHabitatForUser(uid: string): Promise<string> {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  const existingId: string | null = userSnap.exists() ? (userSnap.data().habitatId ?? null) : null;
  if (existingId) return existingId;

  const habitatRef = await addDoc(collection(db, 'habitats'), {
    ownerUid: uid,
    buildingLevels: {},
    activeBuildJob: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await updateDoc(userRef, { habitatId: habitatRef.id });
  return habitatRef.id;
}

export async function writeHabitatState(
  habitatId: string,
  data: Partial<HabitatSnapshot>,
): Promise<void> {
  const ref = doc(db, 'habitats', habitatId);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

export function subscribeToHabitat(
  habitatId: string,
  onUpdate: (data: HabitatSnapshot) => void,
): Unsubscribe {
  const ref = doc(db, 'habitats', habitatId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      onUpdate({
        buildingLevels: (d.buildingLevels as Partial<Record<BuildingType, number>>) ?? {},
        activeBuildJob: (d.activeBuildJob as ActiveBuildJob | null) ?? null,
        outpostLevel:   (d.outpostLevel as number | undefined) ?? 1,
      });
    },
    (err) => console.error('subscribeToHabitat error:', err),
  );
}

export async function getPlayerIndexEntry(uid: string): Promise<PlayerIndexEntry | null> {
  const snap = await getDoc(doc(db, 'playerIndex', uid));
  return snap.exists() ? (snap.data() as PlayerIndexEntry) : null;
}

export async function deletePlayerIndex(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'playerIndex', uid));
}

