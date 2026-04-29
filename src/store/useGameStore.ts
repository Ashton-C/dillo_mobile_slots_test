import { create } from 'zustand';
import { SpinResult, slotsEngine, TemporalRiftTier, RIFT_COSTS } from '@/services/SlotsEngine';
import { useDroneStore } from '@/store/useDroneStore';
import { writeUserResources } from '@/services/FirestoreService';
import { anomalyService } from '@/services/AnomalyService';
import { auth } from '@/lib/firebase';

const MAX_SPINS = 50;
const SPIN_REFILL_MS = 5 * 60_000; // 1 spin every 5 minutes

interface Resources {
  credits: number;
  attacks: number;
  raids: number;
  shields: number;
  spinsRemaining: number;
  spinRefillStart: number; // unix ms when current refill cycle started; 0 = at max
  xp: number;
  level: number;
}

interface SpinState {
  isSpinning: boolean;
  lastResult: SpinResult | null;
  riftTier: TemporalRiftTier;
  msUntilNextSpin: number;
  msUntilFull: number;
}

interface GameState extends Resources, SpinState {
  spin: () => SpinResult | null;
  setRiftTier: (tier: TemporalRiftTier) => void;
  consumeAttack: () => boolean;
  consumeRaid: () => boolean;
  consumeShield: () => boolean;
  addCredits: (amount: number) => void;
  subtractCredits: (amount: number) => boolean;
  refillSpins: () => void;
  tickSpinRefill: () => void;
  syncFromFirestore: (resources: Partial<Resources>) => void;
  setIsSpinning: (spinning: boolean) => void;
}

const INITIAL_RESOURCES: Resources = {
  credits: 500,
  attacks: 5,
  raids: 0,
  shields: 0,
  spinsRemaining: 50,
  spinRefillStart: 0,
  xp: 0,
  level: 1,
};

const XP_PER_SPIN = 5;
const XP_PER_LEVEL = (level: number) => 100 * level;

function persistResources(data: Partial<Resources>) {
  const uid = auth.currentUser?.uid;
  if (uid) writeUserResources(uid, data).catch(console.error);
}

export const useGameStore = create<GameState>((set, get) => ({
  ...INITIAL_RESOURCES,
  isSpinning: false,
  lastResult: null,
  riftTier: 0,
  msUntilNextSpin: 0,
  msUntilFull: 0,

  spin() {
    const { spinsRemaining, riftTier, credits, spinRefillStart } = get();
    if (spinsRemaining <= 0 || get().isSpinning) return null;

    const riftCost = RIFT_COSTS[riftTier];
    if (riftCost > credits) return null;

    set({ isSpinning: true });

    slotsEngine.setRiftTier(riftTier);
    const result = slotsEngine.spin();

    const droneEffects = useDroneStore.getState().getEffects();
    useDroneStore.getState().tickSpins();
    const boostedCreditsWon = Math.floor(
      result.creditsWon * droneEffects.creditMultiplier * (anomalyService.getDefinition()?.creditMultiplier ?? 1),
    );

    let nextState: Partial<Resources> = {};

    set((state) => {
      const newCredits = Math.max(0, state.credits - riftCost + boostedCreditsWon);
      const newXp = state.xp + XP_PER_SPIN + (result.isJackpot ? 20 : 0);
      const xpNeeded = XP_PER_LEVEL(state.level);
      const leveledUp = newXp >= xpNeeded;
      const newSpins = state.spinsRemaining - 1;

      // Start refill cycle only when dropping below max for the first time
      const newRefillStart = state.spinRefillStart === 0 ? Date.now() : state.spinRefillStart;

      nextState = {
        credits: newCredits,
        attacks: Math.min(MAX_SPINS, state.attacks + result.attacksWon),
        raids: Math.min(MAX_SPINS, state.raids + result.raidsWon),
        shields: Math.min(MAX_SPINS, state.shields + result.shieldsWon),
        spinsRemaining: newSpins,
        spinRefillStart: newRefillStart,
        xp: leveledUp ? newXp - xpNeeded : newXp,
        level: leveledUp ? state.level + 1 : state.level,
      };

      return { ...nextState, lastResult: result, isSpinning: false };
    });

    persistResources(nextState);
    return result;
  },

  tickSpinRefill() {
    const { spinsRemaining, spinRefillStart } = get();

    if (spinsRemaining >= MAX_SPINS || spinRefillStart === 0) {
      set({ msUntilNextSpin: 0, msUntilFull: 0 });
      return;
    }

    const now = Date.now();
    const elapsed = now - spinRefillStart;
    const earned = Math.floor(elapsed / SPIN_REFILL_MS);

    if (earned > 0) {
      const newSpins = Math.min(MAX_SPINS, spinsRemaining + earned);
      const newRefillStart = spinRefillStart + earned * SPIN_REFILL_MS;

      if (newSpins >= MAX_SPINS) {
        const update = { spinsRemaining: newSpins, spinRefillStart: 0 };
        set({ ...update, msUntilNextSpin: 0, msUntilFull: 0 });
        persistResources(update);
      } else {
        const msInCycle = now - newRefillStart;
        const msUntilNextSpin = SPIN_REFILL_MS - msInCycle;
        const spinsNeeded = MAX_SPINS - newSpins;
        const msUntilFull = msUntilNextSpin + (spinsNeeded - 1) * SPIN_REFILL_MS;
        const update = { spinsRemaining: newSpins, spinRefillStart: newRefillStart };
        set({ ...update, msUntilNextSpin, msUntilFull });
        persistResources(update);
      }
    } else {
      const msUntilNextSpin = SPIN_REFILL_MS - (elapsed % SPIN_REFILL_MS);
      const spinsNeeded = MAX_SPINS - spinsRemaining;
      const msUntilFull = msUntilNextSpin + (spinsNeeded - 1) * SPIN_REFILL_MS;
      set({ msUntilNextSpin, msUntilFull });
    }
  },

  setRiftTier(tier) {
    set({ riftTier: tier });
  },

  consumeAttack() {
    const { attacks } = get();
    if (attacks <= 0) return false;
    const next = { attacks: attacks - 1 };
    set(next);
    persistResources(next);
    return true;
  },

  consumeRaid() {
    const { raids } = get();
    if (raids <= 0) return false;
    const next = { raids: raids - 1 };
    set(next);
    persistResources(next);
    return true;
  },

  consumeShield() {
    const { shields } = get();
    if (shields <= 0) return false;
    const next = { shields: shields - 1 };
    set(next);
    persistResources(next);
    return true;
  },

  addCredits(amount) {
    const next = { credits: get().credits + amount };
    set(next);
    persistResources(next);
  },

  subtractCredits(amount) {
    const { credits } = get();
    if (credits < amount) return false;
    const next = { credits: credits - amount };
    set(next);
    persistResources(next);
    return true;
  },

  refillSpins() {
    const next = { spinsRemaining: MAX_SPINS, spinRefillStart: 0 };
    set(next);
    persistResources(next);
  },

  syncFromFirestore(resources) {
    set((state) => ({ ...state, ...resources }));
  },

  setIsSpinning(spinning) {
    set({ isSpinning: spinning });
  },
}));
