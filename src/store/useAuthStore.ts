import { create } from 'zustand';
import {
  signInAnonymously,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { subscribeToUser, subscribeToHabitat, ensureHabitatForUser } from '@/services/FirestoreService';
import { useGameStore } from '@/store/useGameStore';
import { useAnomalyStore } from '@/store/useAnomalyStore';
import { useHabitatStore } from '@/store/useHabitatStore';

interface AuthState {
  user: User | null;
  displayName: string | null;
  avatarColor: string;
  needsUsername: boolean;
  isLoading: boolean;
  error: string | null;
  initialize: () => () => void;
  setDisplayName: (name: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  displayName: null,
  avatarColor: '#FF6B35',
  needsUsername: false,
  isLoading: true,
  error: null,

  initialize() {
    let userUnsub: (() => void) | null = null;
    let habitatUnsub: (() => void) | null = null;
    let anomalyUnsub: (() => void) | null = null;

    const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
      userUnsub?.();
      habitatUnsub?.();
      anomalyUnsub?.();

      if (firebaseUser) {
        const profile = await ensureUserDoc(firebaseUser);

        userUnsub = subscribeToUser(firebaseUser.uid, (snapshot) => {
          useGameStore.getState().syncFromFirestore(snapshot);
        });

        const habitatId = await ensureHabitatForUser(firebaseUser.uid);
        useHabitatStore.getState().setHabitatId(habitatId);
        habitatUnsub = subscribeToHabitat(habitatId, (snapshot) => {
          useHabitatStore.getState().syncFromFirestore(snapshot);
        });

        anomalyUnsub = useAnomalyStore.getState().subscribe();

        set({
          user: firebaseUser,
          displayName: profile.displayName,
          avatarColor: profile.avatarColor,
          needsUsername: !profile.hasSetUsername,
          isLoading: false,
          error: null,
        });
      } else {
        try {
          await signInAnonymously(auth);
        } catch {
          set({ isLoading: false, error: 'Sign-in failed' });
        }
      }
    });

    return () => {
      authUnsub();
      userUnsub?.();
      habitatUnsub?.();
      anomalyUnsub?.();
    };
  },

  async setDisplayName(name) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), {
      displayName: name,
      hasSetUsername: true,
      updatedAt: serverTimestamp(),
    });
    set({ displayName: name, needsUsername: false });
  },
}));

interface UserProfile {
  displayName: string;
  avatarColor: string;
  hasSetUsername: boolean;
}

async function ensureUserDoc(user: User): Promise<UserProfile> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d = snap.data();
    return {
      displayName: d.displayName ?? `Pilot_${user.uid.slice(0, 5)}`,
      avatarColor: d.avatarColor ?? '#FF6B35',
      hasSetUsername: d.hasSetUsername ?? false,
    };
  }

  const defaultName = `Pilot_${user.uid.slice(0, 5)}`;
  await setDoc(ref, {
    uid: user.uid,
    displayName: defaultName,
    avatarColor: '#FF6B35',
    hasSetUsername: false,
    credits: 500,
    attacks: 5,
    raids: 0,
    shields: 0,
    spinsRemaining: 50,
    lastSpinRefillAt: null,
    xp: 0,
    level: 1,
    habitatId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return { displayName: defaultName, avatarColor: '#FF6B35', hasSetUsername: false };
}
