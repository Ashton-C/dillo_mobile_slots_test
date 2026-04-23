import { create } from 'zustand';
import { SpinResult, slotsEngine, TemporalRiftTier, RIFT_COSTS } from '@/services/SlotsEngine';
import { useDroneStore } from '@/store/useDroneStore';

interface Resources {
  credits: number;
  attacks: number;
  raids: number;
  shields: number;
  spinsRemaining: number;
  xp: number;
  level: number;
}

interface SpinState {
  isSpinning: boolean;
  lastResult: SpinResult | null;
  riftTier: TemporalRiftTier;
}

interface GameState extends Resources, SpinState {
  // Actions
  spin: () => SpinResult | null;
  setRiftTier: (tier: TemporalRiftTier) => void;
  consumeAttack: () => boolean;
  consumeRaid: () => boolean;
  consumeShield: () => boolean;
  addCredits: (amount: number) => void;
  subtractCredits: (amount: number) => boolean;
  refillSpins: () => void;
  syncFromFirestore: (resources: Partial<Resources>) => void;
  setIsSpinning: (spinning: boolean) => void;
}

const INITIAL_RESOURCES: Resources = {
  credits: 500,
  attacks: 5,
  raids: 0,
  shields: 0,
  spinsRemaining: 50,
  xp: 0,
  level: 1,
};

const XP_PER_SPIN = 5;
const XP_PER_LEVEL = (level: number) => 100 * level;

export const useGameStore = create<GameState>((set, get) => ({
  ...INITIAL_RESOURCES,
  isSpinning: false,
  lastResult: null,
  riftTier: 0,

  spin() {
    const { spinsRemaining, riftTier, credits } = get();

    if (spinsRemaining <= 0 || get().isSpinning) return null;

    // Deduct rift cost before spinning
    const riftCost = RIFT_COSTS[riftTier];
    if (riftCost > credits) return null;

    set({ isSpinning: true });

    slotsEngine.setRiftTier(riftTier);
    const result = slotsEngine.spin();

    // Apply active drone effects then tick ON_SPIN drones
    const droneEffects = useDroneStore.getState().getEffects();
    useDroneStore.getState().tickSpins();

    const boostedCreditsWon = Math.floor(result.creditsWon * droneEffects.creditMultiplier);

    set((state) => {
      const newCredits = Math.max(0, state.credits - riftCost + boostedCreditsWon);
      const newXp = state.xp + XP_PER_SPIN + (result.isJackpot ? 20 : 0);
      const xpNeeded = XP_PER_LEVEL(state.level);
      const leveledUp = newXp >= xpNeeded;

      return {
        credits: newCredits,
        attacks: Math.min(50, state.attacks + result.attacksWon),
        raids: Math.min(50, state.raids + result.raidsWon),
        shields: Math.min(50, state.shields + result.shieldsWon),
        spinsRemaining: state.spinsRemaining - 1,
        xp: leveledUp ? newXp - xpNeeded : newXp,
        level: leveledUp ? state.level + 1 : state.level,
        lastResult: result,
        isSpinning: false,
      };
    });

    return result;
  },

  setRiftTier(tier) {
    set({ riftTier: tier });
  },

  consumeAttack() {
    const { attacks } = get();
    if (attacks <= 0) return false;
    set((state) => ({ attacks: state.attacks - 1 }));
    return true;
  },

  consumeRaid() {
    const { raids } = get();
    if (raids <= 0) return false;
    set((state) => ({ raids: state.raids - 1 }));
    return true;
  },

  consumeShield() {
    const { shields } = get();
    if (shields <= 0) return false;
    set((state) => ({ shields: state.shields - 1 }));
    return true;
  },

  addCredits(amount) {
    set((state) => ({ credits: state.credits + amount }));
  },

  subtractCredits(amount) {
    const { credits } = get();
    if (credits < amount) return false;
    set((state) => ({ credits: state.credits - amount }));
    return true;
  },

  refillSpins() {
    set({ spinsRemaining: 50 });
  },

  syncFromFirestore(resources) {
    set((state) => ({ ...state, ...resources }));
  },

  setIsSpinning(spinning) {
    set({ isSpinning: spinning });
  },
}));
