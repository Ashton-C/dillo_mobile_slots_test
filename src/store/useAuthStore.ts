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
  serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { subscribeToUser } from '@/services/FirestoreService';
import { useGameStore } from '@/store/useGameStore';
import { useAnomalyStore } from '@/store/useAnomalyStore';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  initialize: () => () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,

  initialize() {
    let firestoreUnsub: (() => void) | null = null;
    let anomalyUnsub: (() => void) | null = null;

    const authUnsub = onAuthStateChanged(auth, async (firebaseUser) => {
      firestoreUnsub?.();
      anomalyUnsub?.();

      if (firebaseUser) {
        await ensureUserDoc(firebaseUser);

        firestoreUnsub = subscribeToUser(firebaseUser.uid, (snapshot) => {
          useGameStore.getState().syncFromFirestore(snapshot);
        });

        // Start anomaly listener only after auth is confirmed
        anomalyUnsub = useAnomalyStore.getState().subscribe();

        set({ user: firebaseUser, isLoading: false, error: null });
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
      firestoreUnsub?.();
      anomalyUnsub?.();
    };
  },
}));

async function ensureUserDoc(user: User): Promise<void> {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      displayName: `Pilot_${user.uid.slice(0, 5)}`,
      avatarColor: '#FF6B35',
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
  }
}
