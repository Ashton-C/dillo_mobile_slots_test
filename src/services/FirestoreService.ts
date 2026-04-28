import {
  doc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
