import { create } from 'zustand';
import { SpinResult, slotsEngine, TemporalRiftTier, RIFT_COSTS } from '@/services/SlotsEngine';
import { useDroneStore } from '@/store/useDroneStore';
import { useHabitatStore } from '@/store/useHabitatStore';
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
  intrusions: number;
  extractions: number;
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
  overclockActive: boolean;
  signalBoostActive: boolean;
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
  tickGeneratorIncome: () => void;
  activateOverclock: () => boolean;
  activateSignalBoost: () => boolean;
  subtractResources: (costs: Partial<Pick<Resources, 'credits' | 'attacks' | 'raids' | 'shields'>>) => boolean;
  syncFromFirestore: (resources: Partial<Resources>) => void;
  setIsSpinning: (spinning: boolean) => void;
}

const INITIAL_RESOURCES: Resources = {
  credits: 500,
  attacks: 5,
  raids: 0,
  shields: 0,
  intrusions: 0,
  extractions: 0,
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
  overclockActive: false,
  signalBoostActive: false,

  spin() {
    const { spinsRemaining, riftTier, credits, spinRefillStart, overclockActive, signalBoostActive } = get();
    if (spinsRemaining <= 0 || get().isSpinning) return null;

    const riftCost = RIFT_COSTS[riftTier];
    if (riftCost > credits) return null;

    set({ isSpinning: true, overclockActive: false, signalBoostActive: false });

    slotsEngine.setRiftTier(riftTier);
    if (signalBoostActive) slotsEngine.setSignalBoost(true);
    const result = slotsEngine.spin();
    if (signalBoostActive) slotsEngine.setSignalBoost(false);

    const droneEffects = useDroneStore.getState().getEffects();
    useDroneStore.getState().tickSpins();
    const genLevel = useHabitatStore.getState().buildingLevels['GENERATOR'] ?? 0;
    const overclockBonus = overclockActive ? genLevel * 50 + 200 : 0;
    const boostedCreditsWon = Math.floor(
      result.creditsWon * droneEffects.creditMultiplier * (anomalyService.getDefinition()?.creditMultiplier ?? 1),
    ) + overclockBonus;

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
        attacks:    Math.min(MAX_SPINS, state.attacks    + result.attacksWon),
        raids:      Math.min(MAX_SPINS, state.raids      + result.raidsWon),
        shields:    Math.min(MAX_SPINS, state.shields    + result.shieldsWon),
        intrusions: Math.min(MAX_SPINS, state.intrusions + result.intrusionsWon),
        extractions:Math.min(MAX_SPINS, state.extractions+ result.extractionsWon),
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

  activateOverclock() {
    const { attacks } = get();
    if (attacks <= 0) return false;
    set({ attacks: attacks - 1, overclockActive: true });
    persistResources({ attacks: attacks - 1 });
    return true;
  },

  activateSignalBoost() {
    const { raids } = get();
    if (raids <= 0) return false;
    set({ raids: raids - 1, signalBoostActive: true });
    persistResources({ raids: raids - 1 });
    return true;
  },

  tickGeneratorIncome() {
    const genLevel = useHabitatStore.getState().buildingLevels['GENERATOR'] ?? 0;
    if (genLevel === 0) return;
    const income = genLevel * 20;
    const next = { credits: get().credits + income };
    set(next);
    persistResources(next);
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

  subtractResources(costs) {
    const { credits, attacks, raids, shields } = get();
    if ((costs.credits ?? 0) > credits) return false;
    if ((costs.attacks ?? 0) > attacks) return false;
    if ((costs.raids ?? 0) > raids) return false;
    if ((costs.shields ?? 0) > shields) return false;
    const next: Partial<Resources> = {
      ...(costs.credits  ? { credits:  credits  - costs.credits  } : {}),
      ...(costs.attacks  ? { attacks:  attacks  - costs.attacks  } : {}),
      ...(costs.raids    ? { raids:    raids    - costs.raids    } : {}),
      ...(costs.shields  ? { shields:  shields  - costs.shields  } : {}),
    };
    set((s) => ({ ...s, ...next }));
    persistResources(next);
    return true;
  },

  syncFromFirestore(resources) {
    set((state) => ({
      ...state,
      ...resources,
      intrusions: resources.intrusions ?? state.intrusions,
      extractions: resources.extractions ?? state.extractions,
    }));
  },

  setIsSpinning(spinning) {
    set({ isSpinning: spinning });
  },
}));
