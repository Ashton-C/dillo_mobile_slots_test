import { z } from 'zod';

// --- Symbol Definitions ---

export const SlotSymbol = z.enum([
  'CREDIT_SMALL',
  'CREDIT_MEDIUM',
  'CREDIT_LARGE',
  'ATTACK',
  'RAID',
  'SHIELD',
  'EMPTY',
]);
export type SlotSymbol = z.infer<typeof SlotSymbol>;

export const SpinOutcomeType = z.enum([
  'CREDITS',
  'ATTACK',
  'RAID',
  'SHIELD',
  'NOTHING',
]);
export type SpinOutcomeType = z.infer<typeof SpinOutcomeType>;

export const SpinResult = z.object({
  reels: z.tuple([SlotSymbol, SlotSymbol, SlotSymbol]),
  outcomeType: SpinOutcomeType,
  creditsWon: z.number().int().min(0),
  attacksWon: z.number().int().min(0),
  raidsWon: z.number().int().min(0),
  shieldsWon: z.number().int().min(0),
  isJackpot: z.boolean(),
});
export type SpinResult = z.infer<typeof SpinResult>;

// --- Weight Tables ---

// Base weights (sum = 100 for readability; engine normalizes)
const BASE_WEIGHTS: Record<SlotSymbol, number> = {
  CREDIT_SMALL: 35,
  CREDIT_MEDIUM: 22,
  CREDIT_LARGE: 12,
  ATTACK: 13,
  RAID: 8,
  SHIELD: 8,
  EMPTY: 2,
};

// Temporal Rift modifiers: spending credits shifts weights toward desired outcomes.
// Each tier adds to the target symbol's weight and subtracts from EMPTY/less valuable.
export type TemporalRiftTier = 0 | 1 | 2 | 3;

const RIFT_MODIFIERS: Record<TemporalRiftTier, Partial<Record<SlotSymbol, number>>> = {
  0: {},
  1: { CREDIT_SMALL: 5, CREDIT_MEDIUM: 3, EMPTY: -4, ATTACK: -2, RAID: -2 },
  2: { CREDIT_MEDIUM: 8, CREDIT_LARGE: 5, EMPTY: -5, CREDIT_SMALL: -3, ATTACK: -3, RAID: -2 },
  3: { CREDIT_LARGE: 12, CREDIT_MEDIUM: 6, RAID: 3, ATTACK: 2, EMPTY: -8, CREDIT_SMALL: -10, SHIELD: -5 },
};

export const RIFT_COSTS: Record<TemporalRiftTier, number> = {
  0: 0,
  1: 50,
  2: 150,
  3: 400,
};

// --- Payout Table ---

// Reward for 3-of-a-kind
const JACKPOT_PAYOUTS: Record<SlotSymbol, Partial<SpinResult>> = {
  CREDIT_SMALL: { creditsWon: 100, outcomeType: 'CREDITS', isJackpot: false },
  CREDIT_MEDIUM: { creditsWon: 500, outcomeType: 'CREDITS', isJackpot: false },
  CREDIT_LARGE: { creditsWon: 2000, outcomeType: 'CREDITS', isJackpot: true },
  ATTACK: { attacksWon: 3, outcomeType: 'ATTACK', isJackpot: false },
  RAID: { raidsWon: 1, outcomeType: 'RAID', isJackpot: false },
  SHIELD: { shieldsWon: 3, outcomeType: 'SHIELD', isJackpot: false },
  EMPTY: { outcomeType: 'NOTHING', isJackpot: false },
};

// Reward for exactly 2-of-a-kind (leftmost pair wins)
const PAIR_PAYOUTS: Partial<Record<SlotSymbol, Partial<SpinResult>>> = {
  CREDIT_SMALL: { creditsWon: 20, outcomeType: 'CREDITS' },
  CREDIT_MEDIUM: { creditsWon: 100, outcomeType: 'CREDITS' },
  CREDIT_LARGE: { creditsWon: 400, outcomeType: 'CREDITS' },
  ATTACK: { attacksWon: 1, outcomeType: 'ATTACK' },
  SHIELD: { shieldsWon: 1, outcomeType: 'SHIELD' },
};

// --- Core Engine ---

export class SlotsEngine {
  private riftTier: TemporalRiftTier = 0;
  private signalBoost = false;

  setRiftTier(tier: TemporalRiftTier): void {
    this.riftTier = tier;
  }

  getRiftTier(): TemporalRiftTier {
    return this.riftTier;
  }

  setSignalBoost(active: boolean): void {
    this.signalBoost = active;
  }

  /**
   * Spins all three reels and evaluates the payline.
   * Returns a deterministic result given the same RNG seed (for server validation).
   */
  spin(): SpinResult {
    const reel0 = this.drawSymbol();
    const reel1 = this.drawSymbol();
    const reel2 = this.drawSymbol();
    return this.evaluate([reel0, reel1, reel2]);
  }

  /**
   * Evaluates a set of 3 symbols and returns the payout.
   * Kept separate so the server can re-evaluate client-provided reels.
   */
  evaluate(reels: [SlotSymbol, SlotSymbol, SlotSymbol]): SpinResult {
    const base: SpinResult = {
      reels,
      outcomeType: 'NOTHING',
      creditsWon: 0,
      attacksWon: 0,
      raidsWon: 0,
      shieldsWon: 0,
      isJackpot: false,
    };

    const [r0, r1, r2] = reels;

    if (r0 === r1 && r1 === r2) {
      // 3-of-a-kind
      return { ...base, ...JACKPOT_PAYOUTS[r0] };
    }

    if (r0 === r1 || r1 === r2) {
      // 2-of-a-kind: winning symbol is the middle (shared) one
      const pairSymbol = r1;
      const payout = PAIR_PAYOUTS[pairSymbol];
      if (payout) return { ...base, ...payout };
    }

    if (r0 === r2) {
      // outer pair
      const payout = PAIR_PAYOUTS[r0];
      if (payout) return { ...base, ...payout };
    }

    return base;
  }

  // --- Private helpers ---

  private drawSymbol(): SlotSymbol {
    const weights = this.buildEffectiveWeights();
    return weightedRandom(weights);
  }

  private buildEffectiveWeights(): Record<SlotSymbol, number> {
    const mods = RIFT_MODIFIERS[this.riftTier];
    const result = { ...BASE_WEIGHTS };

    // Signal Boost amplifies credit symbol weights before rift modifiers
    if (this.signalBoost) {
      result.CREDIT_SMALL = Math.round(result.CREDIT_SMALL * 1.5);
      result.CREDIT_MEDIUM = Math.round(result.CREDIT_MEDIUM * 1.5);
      result.CREDIT_LARGE = Math.round(result.CREDIT_LARGE * 1.5);
    }

    for (const [sym, delta] of Object.entries(mods) as [SlotSymbol, number][]) {
      result[sym] = Math.max(1, result[sym] + delta);
    }

    return result;
  }
}

function weightedRandom(weights: Record<SlotSymbol, number>): SlotSymbol {
  const entries = Object.entries(weights) as [SlotSymbol, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;

  for (const [symbol, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return symbol;
  }

  // Fallback — should never hit
  return entries[0][0];
}

// Singleton for client-side use; server creates its own instance per request.
export const slotsEngine = new SlotsEngine();
