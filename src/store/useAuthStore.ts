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

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  initialize: () => () => void; // returns unsubscribe fn
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  error: null,

  initialize() {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        await ensureUserDoc(firebaseUser);
        set({ user: firebaseUser, isLoading: false, error: null });
      } else {
        // No session — sign in anonymously
        try {
          await signInAnonymously(auth);
          // onAuthStateChanged will fire again with the new user
        } catch (e) {
          set({ isLoading: false, error: 'Sign-in failed' });
        }
      }
    });

    return unsubscribe;
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
