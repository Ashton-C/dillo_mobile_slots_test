import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  collection,
  addDoc,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { BuildingType, ActiveBuildJob } from '@/models/Habitat';

export interface HabitatSnapshot {
  buildingLevels: Partial<Record<BuildingType, number>>;
  activeBuildJob: ActiveBuildJob | null;
}

export interface UserResourceSnapshot {
  credits: number;
  attacks: number;
  raids: number;
  shields: number;
  spinsRemaining: number;
  xp: number;
  level: number;
}

// Write resource deltas back to Firestore after a spin or action.
// Uses a plain object so the caller controls what gets written.
export async function writeUserResources(
  uid: string,
  data: Partial<UserResourceSnapshot>,
): Promise<void> {
  const ref = doc(db, 'users', uid);
  await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
}

// Subscribe to real-time resource updates (attacks, raids from other players).
export function subscribeToUser(
  uid: string,
  onUpdate: (data: UserResourceSnapshot) => void,
): Unsubscribe {
  const ref = doc(db, 'users', uid);
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();
    onUpdate({
      credits: d.credits ?? 0,
      attacks: d.attacks ?? 0,
      raids: d.raids ?? 0,
      shields: d.shields ?? 0,
      spinsRemaining: d.spinsRemaining ?? 50,
      xp: d.xp ?? 0,
      level: d.level ?? 1,
    });
  });
}

// Ensure a habitat doc exists for the user. Creates one if missing and writes
// the habitatId back to the user doc. Returns the habitatId.
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
  return onSnapshot(ref, (snap) => {
    if (!snap.exists()) return;
    const d = snap.data();
    onUpdate({
      buildingLevels: (d.buildingLevels as Partial<Record<BuildingType, number>>) ?? {},
      activeBuildJob: (d.activeBuildJob as ActiveBuildJob | null) ?? null,
    });
  });
}
