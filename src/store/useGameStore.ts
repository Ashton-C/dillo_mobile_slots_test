import { create } from 'zustand';
import {
  SpinResult, SlotSymbol, SpinOutcomeType, slotsEngine, TemporalRiftTier, RIFT_COSTS,
  MultiSpinResult, ReelWindow, WinLine, WinLineId,
} from '@/services/SlotsEngine';
import { useDroneStore } from '@/store/useDroneStore';
import { useHabitatStore, getNumActiveLines } from '@/store/useHabitatStore';
import { writeUserResources } from '@/services/FirestoreService';
import { anomalyService } from '@/services/AnomalyService';
import { getMaxSpins } from '@/models/Habitat';
import { auth } from '@/lib/firebase';

export interface SpinHistoryEntry {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol];
  outcomeType: SpinOutcomeType;
  isJackpot: boolean;
  baseCreditsWon: number;
  finalCreditsWon: number;
  attacksWon: number;
  raidsWon: number;
  shieldsWon: number;
  intrusionsWon: number;
  extractionsWon: number;
  riftTier: number;
  riftCost: number;
  overclockUsed: boolean;
  overclockBonus: number;
  signalBoostUsed: boolean;
  droneMultiplier: number;
  anomalyMultiplier: number;
  timestamp: number;
  reelWindow?: ReelWindow;
  winLineIds: WinLineId[];
}

const MAX_SPINS = 50;
const SPIN_REFILL_MS = 5 * 60_000; // 1 spin every 5 minutes
export const SPIN_ANIM_MS = 2200;  // reel animation duration — must match ReelDisplay

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
  totalSpins: number;
  totalCreditsEarned: number;
  totalJackpots: number;
  totalBreachesAttempted: number;
  totalExtractionsAttempted: number;
  totalRaidsSuffered: number;
}

interface SpinState {
  isSpinning: boolean;
  lastResult: SpinResult | null;
  reelWindow: ReelWindow | null;
  activeWinLines: WinLine[] | null;
  riftTier: TemporalRiftTier;
  msUntilNextSpin: number;
  msUntilFull: number;
  overclockActive: boolean;
  signalBoostActive: boolean;
  spinHistory: SpinHistoryEntry[];
  sessionSpins: number;
  sessionCreditsEarned: number;
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
  subtractResources: (costs: Partial<Pick<Resources, 'credits' | 'attacks' | 'raids' | 'shields' | 'intrusions' | 'extractions'>>) => boolean;
  grantResources: (rewards: { credits?: number; fuel?: number; boost?: number; shields?: number; spinRefill?: boolean }) => void;
  syncFromFirestore: (resources: Partial<Resources>) => void;
  setIsSpinning: (spinning: boolean) => void;
  debugSetResources: (delta: Partial<Resources>) => void;
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
  totalSpins: 0,
  totalCreditsEarned: 0,
  totalJackpots: 0,
  totalBreachesAttempted: 0,
  totalExtractionsAttempted: 0,
  totalRaidsSuffered: 0,
};

const XP_PER_SPIN = 5;
const XP_PER_LEVEL = (level: number) => 100 * level;

function persistResources(data: Partial<Resources>) {
  const uid = auth.currentUser?.uid;
  if (uid) writeUserResources(uid, data).catch(console.error);
}

function deriveOutcomeType(multi: MultiSpinResult): SpinOutcomeType {
  if (multi.creditsWon > 0)     return 'CREDITS';
  if (multi.attacksWon > 0)     return 'ATTACK';
  if (multi.raidsWon > 0)       return 'RAID';
  if (multi.shieldsWon > 0)     return 'SHIELD';
  if (multi.intrusionsWon > 0)  return 'INTRUSION';
  if (multi.extractionsWon > 0) return 'EXTRACTION';
  return 'NOTHING';
}

export const useGameStore = create<GameState>((set, get) => ({
  ...INITIAL_RESOURCES,
  isSpinning: false,
  lastResult: null,
  reelWindow: null,
  activeWinLines: null,
  riftTier: 0,
  msUntilNextSpin: 0,
  msUntilFull: 0,
  overclockActive: false,
  signalBoostActive: false,
  spinHistory: [],
  sessionSpins: 0,
  sessionCreditsEarned: 0,

  spin() {
    const {
      spinsRemaining, riftTier, credits, spinRefillStart,
      overclockActive, signalBoostActive,
      xp, level, attacks, raids, shields, intrusions, extractions,
      spinHistory, sessionSpins, sessionCreditsEarned,
      totalSpins, totalCreditsEarned, totalJackpots,
    } = get();

    if (spinsRemaining <= 0 || get().isSpinning) return null;

    const riftCost = RIFT_COSTS[riftTier];
    if (riftCost > credits) return null;

    const outpostLevel = useHabitatStore.getState().outpostLevel;
    const numLines = getNumActiveLines(outpostLevel);

    slotsEngine.setRiftTier(riftTier);
    if (signalBoostActive) slotsEngine.setSignalBoost(true);
    const multi = slotsEngine.spinRows(numLines);
    if (signalBoostActive) slotsEngine.setSignalBoost(false);

    const result: SpinResult = {
      reels: multi.reelWindow[1],
      outcomeType: deriveOutcomeType(multi),
      creditsWon: multi.creditsWon,
      attacksWon: multi.attacksWon,
      raidsWon: multi.raidsWon,
      shieldsWon: multi.shieldsWon,
      intrusionsWon: multi.intrusionsWon,
      extractionsWon: multi.extractionsWon,
      isJackpot: multi.isJackpot,
    };

    const droneEffects = useDroneStore.getState().getEffects();
    useDroneStore.getState().tickSpins();
    const genLevel = useHabitatStore.getState().buildingLevels['GENERATOR'] ?? 0;
    const overclockBonus = overclockActive ? genLevel * 40 + 100 : 0;
    const anomalyMultiplier = anomalyService.getDefinition()?.creditMultiplier ?? 1;
    const boostedCreditsWon = Math.floor(
      result.creditsWon * droneEffects.creditMultiplier * anomalyMultiplier,
    ) + overclockBonus;

    // Pre-calculate all resource changes using values captured at spin time
    const newCredits = Math.max(0, credits - riftCost + boostedCreditsWon);
    const newXp = xp + XP_PER_SPIN + (result.isJackpot ? 20 : 0);
    const xpNeeded = XP_PER_LEVEL(level);
    const leveledUp = newXp >= xpNeeded;
    const newRefillStart = spinRefillStart === 0 ? Date.now() : spinRefillStart;

    const nextState: Partial<Resources> = {
      credits: newCredits,
      attacks:     Math.min(MAX_SPINS, attacks     + result.attacksWon),
      raids:       Math.min(MAX_SPINS, raids       + result.raidsWon),
      shields:     Math.min(MAX_SPINS, shields     + result.shieldsWon),
      intrusions:  Math.min(MAX_SPINS, intrusions  + result.intrusionsWon),
      extractions: Math.min(MAX_SPINS, extractions + result.extractionsWon),
      spinsRemaining: spinsRemaining - 1,
      spinRefillStart: newRefillStart,
      xp: leveledUp ? newXp - xpNeeded : newXp,
      level: leveledUp ? level + 1 : level,
    };

    const historyEntry: SpinHistoryEntry = {
      reels: result.reels,
      outcomeType: result.outcomeType,
      isJackpot: result.isJackpot,
      baseCreditsWon: result.creditsWon,
      finalCreditsWon: boostedCreditsWon,
      attacksWon: result.attacksWon,
      raidsWon: result.raidsWon,
      shieldsWon: result.shieldsWon,
      intrusionsWon: result.intrusionsWon,
      extractionsWon: result.extractionsWon,
      riftTier,
      riftCost,
      overclockUsed: overclockActive,
      overclockBonus,
      signalBoostUsed: signalBoostActive,
      droneMultiplier: droneEffects.creditMultiplier,
      anomalyMultiplier,
      timestamp: Date.now(),
      reelWindow: multi.reelWindow,
      winLineIds: multi.winLines.map((wl) => wl.id),
    };
    const newHistory = [historyEntry, ...spinHistory].slice(0, 25);

    // Phase 1: expose animation targets, start spin (atomic)
    set({
      isSpinning: true,
      overclockActive: false,
      signalBoostActive: false,
      reelWindow: multi.reelWindow,
      activeWinLines: multi.winLines,
      lastResult: null,
    });

    // Phase 2: reveal result and apply resources after animation completes
    setTimeout(() => {
      set({
        ...nextState,
        lastResult: { ...result, creditsWon: boostedCreditsWon },
        reelWindow: multi.reelWindow,
        activeWinLines: multi.winLines,
        isSpinning: false,
        spinHistory: newHistory,
        sessionSpins: sessionSpins + 1,
        sessionCreditsEarned: sessionCreditsEarned + boostedCreditsWon,
        totalSpins: totalSpins + 1,
        totalCreditsEarned: totalCreditsEarned + boostedCreditsWon,
        totalJackpots: totalJackpots + (result.isJackpot ? 1 : 0),
      });
      persistResources(nextState);
    }, SPIN_ANIM_MS);

    return result;
  },

  tickSpinRefill() {
    const { spinsRemaining, spinRefillStart } = get();
    const barracksLevel = useHabitatStore.getState().buildingLevels['BARRACKS'] ?? 0;
    const spinCap = getMaxSpins(barracksLevel);

    if (spinsRemaining >= spinCap || spinRefillStart === 0) {
      set({ msUntilNextSpin: 0, msUntilFull: 0 });
      return;
    }

    const now = Date.now();
    const elapsed = now - spinRefillStart;
    const earned = Math.floor(elapsed / SPIN_REFILL_MS);

    if (earned > 0) {
      const newSpins = Math.min(spinCap, spinsRemaining + earned);
      const newRefillStart = spinRefillStart + earned * SPIN_REFILL_MS;

      if (newSpins >= spinCap) {
        const update = { spinsRemaining: newSpins, spinRefillStart: 0 };
        set({ ...update, msUntilNextSpin: 0, msUntilFull: 0 });
        persistResources(update);
      } else {
        const msInCycle = now - newRefillStart;
        const msUntilNextSpin = SPIN_REFILL_MS - msInCycle;
        const spinsNeeded = spinCap - newSpins;
        const msUntilFull = msUntilNextSpin + (spinsNeeded - 1) * SPIN_REFILL_MS;
        const update = { spinsRemaining: newSpins, spinRefillStart: newRefillStart };
        set({ ...update, msUntilNextSpin, msUntilFull });
        persistResources(update);
      }
    } else {
      const msUntilNextSpin = SPIN_REFILL_MS - (elapsed % SPIN_REFILL_MS);
      const spinsNeeded = spinCap - spinsRemaining;
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

  grantResources(rewards) {
    const s = get();
    const next: Partial<Resources> = {};
    if (rewards.credits) next.credits = s.credits + rewards.credits;
    if (rewards.fuel)    next.attacks = Math.min(MAX_SPINS, s.attacks + rewards.fuel);
    if (rewards.boost)   next.raids   = Math.min(MAX_SPINS, s.raids   + rewards.boost);
    if (rewards.shields) next.shields = Math.min(MAX_SPINS, s.shields + rewards.shields);
    if (rewards.spinRefill) {
      next.spinsRemaining  = MAX_SPINS;
      next.spinRefillStart = 0;
    }
    set((state) => ({ ...state, ...next }));
    persistResources(next);
  },

  subtractResources(costs) {
    const { credits, attacks, raids, shields, intrusions, extractions,
            totalBreachesAttempted, totalExtractionsAttempted } = get();
    if ((costs.credits    ?? 0) > credits)    return false;
    if ((costs.attacks    ?? 0) > attacks)    return false;
    if ((costs.raids      ?? 0) > raids)      return false;
    if ((costs.shields    ?? 0) > shields)    return false;
    if ((costs.intrusions ?? 0) > intrusions) return false;
    if ((costs.extractions ?? 0) > extractions) return false;
    const next: Partial<Resources> = {
      ...(costs.credits    ? { credits:    credits    - costs.credits    } : {}),
      ...(costs.attacks    ? { attacks:    attacks    - costs.attacks    } : {}),
      ...(costs.raids      ? { raids:      raids      - costs.raids      } : {}),
      ...(costs.shields    ? { shields:    shields    - costs.shields    } : {}),
      ...(costs.intrusions ? { intrusions: intrusions - costs.intrusions } : {}),
      ...(costs.extractions ? { extractions: extractions - costs.extractions } : {}),
      ...(costs.intrusions  ? { totalBreachesAttempted: totalBreachesAttempted + (costs.intrusions ?? 0) } : {}),
      ...(costs.extractions ? { totalExtractionsAttempted: totalExtractionsAttempted + (costs.extractions ?? 0) } : {}),
    };
    set((s) => ({ ...s, ...next }));
    persistResources(next);
    return true;
  },

  syncFromFirestore(resources) {
    set((state) => {
      const merged = {
        ...state,
        ...resources,
        intrusions:  resources.intrusions  ?? state.intrusions,
        extractions: resources.extractions ?? state.extractions,
      };

      // Repair inconsistent state: spins below max but no refill timer running.
      // Happens when the user ran out of spins while offline and Firestore
      // recorded 0 spins but never set spinRefillStart.
      if (merged.spinsRemaining < MAX_SPINS && merged.spinRefillStart === 0) {
        const repaired = { ...merged, spinRefillStart: Date.now() };
        persistResources({ spinRefillStart: repaired.spinRefillStart });
        return repaired;
      }

      return merged;
    });
  },

  setIsSpinning(spinning) {
    set({ isSpinning: spinning });
  },

  debugSetResources(delta) {
    set((s) => {
      const next: Partial<Resources> = {
        credits:        Math.max(0, s.credits        + (delta.credits        ?? 0)),
        attacks:        Math.max(0, s.attacks        + (delta.attacks        ?? 0)),
        raids:          Math.max(0, s.raids          + (delta.raids          ?? 0)),
        shields:        Math.max(0, s.shields        + (delta.shields        ?? 0)),
        intrusions:     Math.max(0, s.intrusions     + (delta.intrusions     ?? 0)),
        extractions:    Math.max(0, s.extractions    + (delta.extractions    ?? 0)),
        spinsRemaining: Math.min(MAX_SPINS, Math.max(0, s.spinsRemaining + (delta.spinsRemaining ?? 0))),
      };
      persistResources(next);
      return { ...s, ...next };
    });
  },
}));
