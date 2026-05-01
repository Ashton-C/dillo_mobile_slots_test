import { SlotSymbol, TemporalRiftTier, RIFT_COSTS } from '@/services/SlotsEngine';

// Mirrors BASE_WEIGHTS and RIFT_MODIFIERS from SlotsEngine.ts — keep in sync.
const BASE_WEIGHTS: Record<SlotSymbol, number> = {
  CREDIT_SMALL:  28,
  CREDIT_MEDIUM: 19,
  CREDIT_LARGE:  14,
  ATTACK:        10,
  RAID:           7,
  SHIELD:         7,
  INTRUSION:      8,
  EXTRACTION:     6,
  EMPTY:          5,
};

const RIFT_MODIFIERS: Record<TemporalRiftTier, Partial<Record<SlotSymbol, number>>> = {
  0: {},
  1: { CREDIT_SMALL: 5, CREDIT_MEDIUM: 3, EMPTY: -4, ATTACK: -2, RAID: -2 },
  2: { CREDIT_MEDIUM: 8, CREDIT_LARGE: 5, EMPTY: -5, CREDIT_SMALL: -3, ATTACK: -3, RAID: -2, INTRUSION: -2, EXTRACTION: -1 },
  3: { CREDIT_LARGE: 12, CREDIT_MEDIUM: 6, RAID: 3, ATTACK: 2, EMPTY: -8, CREDIT_SMALL: -10, SHIELD: -5, INTRUSION: -3, EXTRACTION: -2 },
};

const TRIPLE_CREDIT_PAYOUT: Record<SlotSymbol, number> = {
  CREDIT_SMALL:  100,
  CREDIT_MEDIUM: 500,
  CREDIT_LARGE:  2000,
  ATTACK: 0, RAID: 0, SHIELD: 0, INTRUSION: 0, EXTRACTION: 0, EMPTY: 0,
};

const PAIR_CREDIT_PAYOUT: Partial<Record<SlotSymbol, number>> = {
  CREDIT_SMALL:  20,
  CREDIT_MEDIUM: 100,
  CREDIT_LARGE:  400,
};

export function computeSymbolWeights(
  riftTier: TemporalRiftTier,
  signalBoost: boolean,
): Record<SlotSymbol, number> {
  const w = { ...BASE_WEIGHTS };

  if (signalBoost) {
    w.CREDIT_SMALL  = Math.round(w.CREDIT_SMALL  * 1.5);
    w.CREDIT_MEDIUM = Math.round(w.CREDIT_MEDIUM * 1.5);
    w.CREDIT_LARGE  = Math.round(w.CREDIT_LARGE  * 1.5);
  }

  const mods = RIFT_MODIFIERS[riftTier];
  for (const [sym, delta] of Object.entries(mods) as [SlotSymbol, number][]) {
    w[sym] = Math.max(1, w[sym] + delta);
  }

  return w;
}

export interface SymbolHitRates {
  singlePct: number;
  triplePct: number;
  pairPct: number;
}

export function computeHitRates(
  weights: Record<SlotSymbol, number>,
): Record<SlotSymbol, SymbolHitRates> {
  const total = Object.values(weights).reduce((s, v) => s + v, 0);
  const result = {} as Record<SlotSymbol, SymbolHitRates>;

  for (const sym of Object.keys(weights) as SlotSymbol[]) {
    const p = weights[sym] / total;
    result[sym] = {
      singlePct: p * 100,
      triplePct: p ** 3 * 100,
      pairPct:   3 * p ** 2 * (1 - p) * 100,
    };
  }

  return result;
}

export function computeExpectedCredits(
  riftTier: TemporalRiftTier,
  signalBoost: boolean,
  numLines: 1 | 3 | 5,
): number {
  const weights = computeSymbolWeights(riftTier, signalBoost);
  const total = Object.values(weights).reduce((s, v) => s + v, 0);

  let evPerLine = 0;
  for (const sym of Object.keys(weights) as SlotSymbol[]) {
    const p = weights[sym] / total;
    const tripleCredit = TRIPLE_CREDIT_PAYOUT[sym] ?? 0;
    const pairCredit   = PAIR_CREDIT_PAYOUT[sym]   ?? 0;
    evPerLine += p ** 3 * tripleCredit;
    evPerLine += 3 * p ** 2 * (1 - p) * pairCredit;
  }

  return evPerLine * numLines;
}

export function computeBreakEven(
  riftTier: TemporalRiftTier,
  numLines: 1 | 3 | 5,
): number {
  const cost = RIFT_COSTS[riftTier];
  if (cost === 0) return 0;
  const baseEv = computeExpectedCredits(riftTier, false, numLines);
  if (baseEv <= 0) return Infinity;
  return cost / baseEv + 1;
}
