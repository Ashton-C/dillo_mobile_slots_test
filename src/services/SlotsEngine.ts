import { z } from 'zod';

// --- Symbol Definitions ---

export const SlotSymbol = z.enum([
  'CREDIT_SMALL',
  'CREDIT_MEDIUM',
  'CREDIT_LARGE',
  'ATTACK',
  'RAID',
  'SHIELD',
  'INTRUSION',
  'EXTRACTION',
  'EMPTY',
]);
export type SlotSymbol = z.infer<typeof SlotSymbol>;

export const SpinOutcomeType = z.enum([
  'CREDITS',
  'ATTACK',
  'RAID',
  'SHIELD',
  'INTRUSION',
  'EXTRACTION',
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
  intrusionsWon: z.number().int().min(0),
  extractionsWon: z.number().int().min(0),
  isJackpot: z.boolean(),
});
export type SpinResult = z.infer<typeof SpinResult>;

// --- Weight Tables ---

const BASE_WEIGHTS: Record<SlotSymbol, number> = {
  CREDIT_SMALL:  28,
  CREDIT_MEDIUM: 19,
  CREDIT_LARGE:  10,
  ATTACK:        10,
  RAID:           7,
  SHIELD:         7,
  INTRUSION:      8,
  EXTRACTION:     6,
  EMPTY:          5,
};

export type TemporalRiftTier = 0 | 1 | 2 | 3;

// Higher rift tiers push toward credits and reduce combat tokens
const RIFT_MODIFIERS: Record<TemporalRiftTier, Partial<Record<SlotSymbol, number>>> = {
  0: {},
  1: { CREDIT_SMALL: 5, CREDIT_MEDIUM: 3, EMPTY: -4, ATTACK: -2, RAID: -2 },
  2: { CREDIT_MEDIUM: 8, CREDIT_LARGE: 5, EMPTY: -5, CREDIT_SMALL: -3, ATTACK: -3, RAID: -2, INTRUSION: -2, EXTRACTION: -1 },
  3: { CREDIT_LARGE: 12, CREDIT_MEDIUM: 6, RAID: 3, ATTACK: 2, EMPTY: -8, CREDIT_SMALL: -10, SHIELD: -5, INTRUSION: -3, EXTRACTION: -2 },
};

export const RIFT_COSTS: Record<TemporalRiftTier, number> = {
  0: 0,
  1: 50,
  2: 150,
  3: 400,
};

// --- Payout Table ---

const JACKPOT_PAYOUTS: Record<SlotSymbol, Partial<SpinResult>> = {
  CREDIT_SMALL:  { creditsWon: 100,   outcomeType: 'CREDITS',    isJackpot: false },
  CREDIT_MEDIUM: { creditsWon: 500,   outcomeType: 'CREDITS',    isJackpot: false },
  CREDIT_LARGE:  { creditsWon: 2000,  outcomeType: 'CREDITS',    isJackpot: true  },
  ATTACK:        { attacksWon: 3,     outcomeType: 'ATTACK',     isJackpot: false },
  RAID:          { raidsWon: 1,       outcomeType: 'RAID',       isJackpot: false },
  SHIELD:        { shieldsWon: 3,     outcomeType: 'SHIELD',     isJackpot: false },
  INTRUSION:     { intrusionsWon: 3,  outcomeType: 'INTRUSION',  isJackpot: false },
  EXTRACTION:    { extractionsWon: 2, outcomeType: 'EXTRACTION', isJackpot: false },
  EMPTY:         { outcomeType: 'NOTHING', isJackpot: false },
};

const PAIR_PAYOUTS: Partial<Record<SlotSymbol, Partial<SpinResult>>> = {
  CREDIT_SMALL:  { creditsWon: 20,    outcomeType: 'CREDITS'    },
  CREDIT_MEDIUM: { creditsWon: 100,   outcomeType: 'CREDITS'    },
  CREDIT_LARGE:  { creditsWon: 400,   outcomeType: 'CREDITS'    },
  ATTACK:        { attacksWon: 1,     outcomeType: 'ATTACK'     },
  SHIELD:        { shieldsWon: 1,     outcomeType: 'SHIELD'     },
  INTRUSION:     { intrusionsWon: 1,  outcomeType: 'INTRUSION'  },
  EXTRACTION:    { extractionsWon: 1, outcomeType: 'EXTRACTION' },
};

// --- Core Engine ---

export class SlotsEngine {
  private riftTier: TemporalRiftTier = 0;
  private signalBoost = false;

  setRiftTier(tier: TemporalRiftTier): void { this.riftTier = tier; }
  getRiftTier(): TemporalRiftTier { return this.riftTier; }
  setSignalBoost(active: boolean): void { this.signalBoost = active; }

  spin(): SpinResult {
    const reel0 = this.drawSymbol();
    const reel1 = this.drawSymbol();
    const reel2 = this.drawSymbol();
    return this.evaluate([reel0, reel1, reel2]);
  }

  evaluate(reels: [SlotSymbol, SlotSymbol, SlotSymbol]): SpinResult {
    const base: SpinResult = {
      reels,
      outcomeType: 'NOTHING',
      creditsWon: 0,
      attacksWon: 0,
      raidsWon: 0,
      shieldsWon: 0,
      intrusionsWon: 0,
      extractionsWon: 0,
      isJackpot: false,
    };

    const [r0, r1, r2] = reels;

    if (r0 === r1 && r1 === r2) {
      return { ...base, ...JACKPOT_PAYOUTS[r0] };
    }

    if (r0 === r1 || r1 === r2) {
      const payout = PAIR_PAYOUTS[r1];
      if (payout) return { ...base, ...payout };
    }

    if (r0 === r2) {
      const payout = PAIR_PAYOUTS[r0];
      if (payout) return { ...base, ...payout };
    }

    return base;
  }

  private drawSymbol(): SlotSymbol {
    return weightedRandom(this.buildEffectiveWeights());
  }

  private buildEffectiveWeights(): Record<SlotSymbol, number> {
    const mods = RIFT_MODIFIERS[this.riftTier];
    const result = { ...BASE_WEIGHTS };

    if (this.signalBoost) {
      result.CREDIT_SMALL  = Math.round(result.CREDIT_SMALL  * 1.5);
      result.CREDIT_MEDIUM = Math.round(result.CREDIT_MEDIUM * 1.5);
      result.CREDIT_LARGE  = Math.round(result.CREDIT_LARGE  * 1.5);
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
  return entries[0][0];
}

export const slotsEngine = new SlotsEngine();
