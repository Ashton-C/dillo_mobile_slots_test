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
  attacks: number;
  raids: number;
  shields: number;
  intrusions: number;
  extractions: number;
  spinsRemaining: number;
  spinRefillStart: number; // unix ms, 0 when at max spins
  xp: number;
  level: number;
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
        credits:         d.credits         ?? 0,
        attacks:         d.attacks         ?? 0,
        raids:           d.raids           ?? 0,
        shields:         d.shields         ?? 0,
        intrusions:      d.intrusions      ?? 0,
        extractions:     d.extractions     ?? 0,
        spinsRemaining:  d.spinsRemaining  ?? 50,
        spinRefillStart: d.spinRefillStart ?? 0,
        xp:              d.xp              ?? 0,
        level:           d.level           ?? 1,
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

// Fetch ~5 random-ish nearby targets (excluding self).
export async function fetchRadarTargets(
  selfUid: string,
  count = 5,
): Promise<PlayerIndexEntry[]> {
  const ref = collection(db, 'playerIndex');
  // No orderBy — avoids composite index requirement; simple limit + client filter.
  const q = query(ref, limit(count + 10));
  const snap = await getDocs(q);
  const results: PlayerIndexEntry[] = [];
  snap.forEach((d) => {
    if (d.id !== selfUid) results.push(d.data() as PlayerIndexEntry);
  });
  return results.slice(0, count);
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

