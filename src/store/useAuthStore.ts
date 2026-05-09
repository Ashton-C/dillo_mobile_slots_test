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
import { subscribeToUser, subscribeToHabitat, ensureHabitatForUser, writePlayerIndex } from '@/services/FirestoreService';
import { useGameStore } from '@/store/useGameStore';
import { useAnomalyStore } from '@/store/useAnomalyStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';

interface AuthState {
  user: User | null;
  displayName: string | null;
  avatarColor: string;
  avatarAccessory: string;
  outpostColor: string;
  needsUsername: boolean;
  isLoading: boolean;
  error: string | null;
  initialize: () => () => void;
  setDisplayName: (name: string) => Promise<void>;
  setAvatarColor: (color: string) => Promise<void>;
  setAvatarAccessory: (accessory: string) => Promise<void>;
  setOutpostColor: (color: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  displayName: null,
  avatarColor: '#FF6B35',
  avatarAccessory: 'none',
  outpostColor: '#9B59FF', // purple — Colors.accent
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
        try {
          const profile = await ensureUserDoc(firebaseUser);

          userUnsub = subscribeToUser(firebaseUser.uid, (snapshot) => {
            useGameStore.getState().syncFromFirestore(snapshot);
            if (snapshot.ownedCosmetics?.length) {
              useCosmeticsStore.getState().syncOwnedFromRemote(snapshot.ownedCosmetics);
            }
          });

          const habitatId = await ensureHabitatForUser(firebaseUser.uid);
          useHabitatStore.getState().setHabitatId(habitatId);
          habitatUnsub = subscribeToHabitat(habitatId, (snapshot) => {
            useHabitatStore.getState().syncFromFirestore(snapshot);
          });

          anomalyUnsub = useAnomalyStore.getState().subscribe();

          const gameState = useGameStore.getState();
          const outpostLevel = useHabitatStore.getState().outpostLevel;
          writePlayerIndex(firebaseUser.uid, {
            displayName: profile.displayName,
            avatarColor: profile.avatarColor,
            outpostLevel,
            level: gameState.level,
          }).catch(console.error);

          set({
            user: firebaseUser,
            displayName: profile.displayName,
            avatarColor: profile.avatarColor,
            avatarAccessory: profile.avatarAccessory,
            outpostColor: profile.outpostColor,
            needsUsername: !profile.hasSetUsername,
            isLoading: false,
            error: null,
          });
        } catch (err) {
          console.error('Auth init error:', err);
          set({ isLoading: false, error: 'Failed to load profile' });
        }
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

    const { avatarColor } = useAuthStore.getState();
    const gameState = useGameStore.getState();
    const outpostLevel = useHabitatStore.getState().outpostLevel;
    writePlayerIndex(uid, {
      displayName: name,
      avatarColor,
      outpostLevel,
      level: gameState.level,
    }).catch(console.error);
  },

  async setAvatarColor(color) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), { avatarColor: color, updatedAt: serverTimestamp() });
    set({ avatarColor: color });
    const { displayName } = useAuthStore.getState();
    const gameState = useGameStore.getState();
    const outpostLevel = useHabitatStore.getState().outpostLevel;
    writePlayerIndex(uid, {
      displayName: displayName ?? '',
      avatarColor: color,
      outpostLevel,
      level: gameState.level,
    }).catch(console.error);
  },

  async setAvatarAccessory(accessory) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), { avatarAccessory: accessory, updatedAt: serverTimestamp() });
    set({ avatarAccessory: accessory });
  },

  async setOutpostColor(color) {
    set({ outpostColor: color });
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    await updateDoc(doc(db, 'users', uid), { outpostColor: color, updatedAt: serverTimestamp() }).catch(console.error);
  },
}));

interface UserProfile {
  displayName: string;
  avatarColor: string;
  avatarAccessory: string;
  outpostColor: string;
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
      avatarAccessory: d.avatarAccessory ?? 'none',
      outpostColor: d.outpostColor ?? '#9B59FF',
      hasSetUsername: d.hasSetUsername ?? false,
    };
  }

  const defaultName = `Pilot_${user.uid.slice(0, 5)}`;
  await setDoc(ref, {
    uid: user.uid,
    displayName: defaultName,
    avatarColor: '#FF6B35',
    avatarAccessory: 'none',
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

  return { displayName: defaultName, avatarColor: '#FF6B35', avatarAccessory: 'none', outpostColor: '#9B59FF', hasSetUsername: false };
}
