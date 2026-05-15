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

// 3x3 line IDs — used for 1x3 (MID only) and 3x3 grids.
// 5x5 line IDs — used at outpost level 10+.
export type WinLineId =
  | 'MID' | 'TOP' | 'BOT' | 'DIAG_DOWN' | 'DIAG_UP'
  | 'HR0' | 'HR1' | 'HR2' | 'HR3' | 'HR4'
  | 'D5_DOWN' | 'D5_UP' | 'V_DOWN' | 'V_UP' | 'W_SHAPE';

export interface WinLine {
  id: WinLineId;
  result: SpinResult;
}

// reelWindow[row][col] — generic rows×cols grid, indexed [row][col].
// 1x3 grids use a single row of 3 symbols; 3x3 has 3×3; 5x5 has 5×5.
export type ReelWindow = SlotSymbol[][];

export interface MultiSpinResult {
  reelWindow: ReelWindow;
  winLines: WinLine[];
  creditsWon: number;
  attacksWon: number;
  raidsWon: number;
  shieldsWon: number;
  intrusionsWon: number;
  extractionsWon: number;
  isJackpot: boolean;
  primaryResult: SpinResult;
}

// --- Weight Tables ---

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

export type TemporalRiftTier = 0 | 1 | 2 | 3;

// Higher rift tiers push toward credits and reduce combat tokens
const RIFT_MODIFIERS: Record<TemporalRiftTier, Partial<Record<SlotSymbol, number>>> = {
  0: {},
  1: { CREDIT_SMALL: 8, CREDIT_MEDIUM: 3, EMPTY: -4, ATTACK: -2, RAID: -2 },
  2: { CREDIT_MEDIUM: 12, CREDIT_LARGE: 5, EMPTY: -5, CREDIT_SMALL: -3, ATTACK: -3, RAID: -2, INTRUSION: -2, EXTRACTION: -1 },
  3: { CREDIT_LARGE: 20, CREDIT_MEDIUM: 6, RAID: 3, ATTACK: 2, EMPTY: -8, CREDIT_SMALL: -10, SHIELD: -5, INTRUSION: -3, EXTRACTION: -2 },
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

// --- Multiline Patterns ---

// LINE_PATTERNS[id] = number[] — row index for each column in left-to-right
// order. 3x3 patterns are length 3; 5x5 patterns are length 5.
export const LINE_PATTERNS: Record<WinLineId, number[]> = {
  // 3x3 lines
  MID:       [1, 1, 1],
  TOP:       [0, 0, 0],
  BOT:       [2, 2, 2],
  DIAG_DOWN: [0, 1, 2],
  DIAG_UP:   [2, 1, 0],
  // 5x5 lines (10 active at outpost lvl 10+)
  HR0:       [0, 0, 0, 0, 0],
  HR1:       [1, 1, 1, 1, 1],
  HR2:       [2, 2, 2, 2, 2],
  HR3:       [3, 3, 3, 3, 3],
  HR4:       [4, 4, 4, 4, 4],
  D5_DOWN:   [0, 1, 2, 3, 4],
  D5_UP:     [4, 3, 2, 1, 0],
  V_DOWN:    [0, 1, 2, 1, 0],
  V_UP:      [4, 3, 2, 3, 4],
  W_SHAPE:   [0, 2, 0, 2, 0],
};

const ACTIVE_LINES: Record<1 | 3 | 5, WinLineId[]> = {
  1: ['MID'],
  3: ['MID', 'TOP', 'BOT'],
  5: ['MID', 'TOP', 'BOT', 'DIAG_DOWN', 'DIAG_UP'],
};

export const ACTIVE_LINES_5X5: WinLineId[] = [
  'HR0', 'HR1', 'HR2', 'HR3', 'HR4',
  'D5_DOWN', 'D5_UP', 'V_DOWN', 'V_UP', 'W_SHAPE',
];

// --- Core Engine ---

// Anomaly hooks read by the engine. Set externally each time the anomaly
// snapshot changes so the engine stays a pure data class (no firestore import).
export interface SlotsAnomalyHooks {
  riftTierBoost: number;
  scrambleWeights: boolean;
  mirrorReels: boolean;
}

const DEFAULT_HOOKS: SlotsAnomalyHooks = {
  riftTierBoost: 0,
  scrambleWeights: false,
  mirrorReels: false,
};

export class SlotsEngine {
  private riftTier: TemporalRiftTier = 0;
  private signalBoost = false;
  private forcedOutcome: Partial<SpinResult> | null = null;
  private anomalyHooks: SlotsAnomalyHooks = { ...DEFAULT_HOOKS };

  setRiftTier(tier: TemporalRiftTier): void { this.riftTier = tier; }
  getRiftTier(): TemporalRiftTier { return this.riftTier; }
  setSignalBoost(active: boolean): void { this.signalBoost = active; }
  setForcedOutcome(override: Partial<SpinResult> | null): void { this.forcedOutcome = override; }
  hasForcedOutcome(): boolean { return this.forcedOutcome !== null; }

  setAnomalyHooks(hooks: Partial<SlotsAnomalyHooks>): void {
    this.anomalyHooks = { ...DEFAULT_HOOKS, ...hooks };
  }
  getAnomalyHooks(): SlotsAnomalyHooks { return this.anomalyHooks; }

  private effectiveTier(): TemporalRiftTier {
    return Math.min(3, this.riftTier + this.anomalyHooks.riftTierBoost) as TemporalRiftTier;
  }

  spin(): SpinResult {
    if (this.forcedOutcome) {
      const override = this.forcedOutcome;
      this.forcedOutcome = null;
      const reel0 = this.drawSymbol();
      const reel1 = this.drawSymbol();
      const reel2 = this.drawSymbol();
      const base = this.evaluate([reel0, reel1, reel2]);
      return { ...base, ...override };
    }
    const reel0 = this.drawSymbol();
    const reel1 = this.drawSymbol();
    const reel2 = this.drawSymbol();
    return this.evaluate([reel0, reel1, reel2]);
  }

  spinRows(numLines: 1 | 3 | 5): MultiSpinResult {
    const col0 = [this.drawSymbol(), this.drawSymbol(), this.drawSymbol()] as [SlotSymbol, SlotSymbol, SlotSymbol];
    const col1 = [this.drawSymbol(), this.drawSymbol(), this.drawSymbol()] as [SlotSymbol, SlotSymbol, SlotSymbol];
    const col2 = [this.drawSymbol(), this.drawSymbol(), this.drawSymbol()] as [SlotSymbol, SlotSymbol, SlotSymbol];

    const reelWindow: ReelWindow = [
      [col0[0], col1[0], col2[0]],
      [col0[1], col1[1], col2[1]],
      [col0[2], col1[2], col2[2]],
    ];

    const activeLineIds = ACTIVE_LINES[numLines];
    return this.evaluateGrid(reelWindow, activeLineIds);
  }

  // Generic grid spin — accepts arbitrary rows×cols and a list of active line
  // ids. Used by both 1x3 (single MID line, hidden TOP/BOT rows in render),
  // 3x3 (1/3/5 lines), and 5x5 (10 lines at outpost lvl 10+).
  spinGrid(rows: number, cols: number, activeLineIds: WinLineId[]): MultiSpinResult {
    const reelWindow: ReelWindow = [];
    for (let r = 0; r < rows; r++) {
      const row: SlotSymbol[] = [];
      for (let c = 0; c < cols; c++) row.push(this.drawSymbol());
      reelWindow.push(row);
    }
    return this.evaluateGrid(reelWindow, activeLineIds);
  }

  private evaluateGrid(reelWindow: ReelWindow, activeLineIds: WinLineId[]): MultiSpinResult {
    const winLines: WinLine[] = [];
    let creditsWon = 0, attacksWon = 0, raidsWon = 0, shieldsWon = 0;
    let intrusionsWon = 0, extractionsWon = 0, isJackpot = false;

    for (const lineId of activeLineIds) {
      const pattern = LINE_PATTERNS[lineId];
      const lineReels: SlotSymbol[] = pattern.map((r, c) => reelWindow[r][c]);
      const lineResult = pattern.length >= 5
        ? this.evaluate5(lineReels)
        : this.evaluate([lineReels[0], lineReels[1], lineReels[2]]);
      if (lineResult.outcomeType !== 'NOTHING') {
        winLines.push({ id: lineId, result: lineResult });
        creditsWon     += lineResult.creditsWon;
        attacksWon     += lineResult.attacksWon;
        raidsWon       += lineResult.raidsWon;
        shieldsWon     += lineResult.shieldsWon;
        intrusionsWon  += lineResult.intrusionsWon;
        extractionsWon += lineResult.extractionsWon;
        if (lineResult.isJackpot) isJackpot = true;
      }
    }

    if (this.anomalyHooks.mirrorReels && reelWindow.length === 5) {
      const cols = reelWindow[0]?.length ?? 0;
      const pairs: [number, number][] = [[0, 4], [1, 3]];
      for (const [r1, r2] of pairs) {
        for (let c = 0; c < cols; c++) {
          const sym = reelWindow[r1][c];
          if (sym !== reelWindow[r2][c]) continue;
          const payout = PAIR_PAYOUTS[sym];
          if (!payout) continue;
          creditsWon     += payout.creditsWon     ?? 0;
          attacksWon     += payout.attacksWon     ?? 0;
          raidsWon       += payout.raidsWon       ?? 0;
          shieldsWon     += payout.shieldsWon     ?? 0;
          intrusionsWon  += payout.intrusionsWon  ?? 0;
          extractionsWon += payout.extractionsWon ?? 0;
        }
      }
    }

    // primaryResult is the middle-row left-3 — kept for SpinResult compat.
    const midRow = reelWindow[Math.floor(reelWindow.length / 2)] ?? reelWindow[0];
    const primaryReels: [SlotSymbol, SlotSymbol, SlotSymbol] = [
      midRow[0], midRow[1] ?? midRow[0], midRow[2] ?? midRow[0],
    ];

    return {
      reelWindow,
      winLines,
      creditsWon,
      attacksWon,
      raidsWon,
      shieldsWon,
      intrusionsWon,
      extractionsWon,
      isJackpot,
      primaryResult: this.evaluate(primaryReels),
    };
  }

  // 5-cell line evaluator: counts leftmost-consecutive matches. >=3 same scales
  // a pair payout by (count - 2); 5 same flags isJackpot.
  evaluate5(reels: SlotSymbol[]): SpinResult {
    const tupleReels: [SlotSymbol, SlotSymbol, SlotSymbol] = [reels[0], reels[1], reels[2]];
    const base: SpinResult = {
      reels: tupleReels,
      outcomeType: 'NOTHING',
      creditsWon: 0,
      attacksWon: 0,
      raidsWon: 0,
      shieldsWon: 0,
      intrusionsWon: 0,
      extractionsWon: 0,
      isJackpot: false,
    };

    const first = reels[0];
    let count = 1;
    for (let i = 1; i < reels.length; i++) {
      if (reels[i] === first) count++;
      else break;
    }
    if (count < 3) return base;

    const payout = count === 5
      ? JACKPOT_PAYOUTS[first]
      : PAIR_PAYOUTS[first];
    if (!payout) return base;

    const scale = count - 2; // 3→1×, 4→2×, 5→3×
    const isJackpotLine = count === 5 && first === 'CREDIT_LARGE';
    return {
      ...base,
      outcomeType:    payout.outcomeType ?? base.outcomeType,
      creditsWon:     (payout.creditsWon     ?? 0) * scale,
      attacksWon:     (payout.attacksWon     ?? 0) * scale,
      raidsWon:       (payout.raidsWon       ?? 0) * scale,
      shieldsWon:     (payout.shieldsWon     ?? 0) * scale,
      intrusionsWon:  (payout.intrusionsWon  ?? 0) * scale,
      extractionsWon: (payout.extractionsWon ?? 0) * scale,
      isJackpot:      isJackpotLine,
    };
  }

  evaluate(reels: [SlotSymbol, SlotSymbol, SlotSymbol]): SpinResult;
  evaluate(reels: SlotSymbol[]): SpinResult;
  evaluate(reels: SlotSymbol[]): SpinResult {
    const tuple: [SlotSymbol, SlotSymbol, SlotSymbol] = [reels[0], reels[1], reels[2]];
    const base: SpinResult = {
      reels: tuple,
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
    if (this.anomalyHooks.scrambleWeights) {
      const scrambled = { ...BASE_WEIGHTS };
      for (const sym of Object.keys(scrambled) as SlotSymbol[]) {
        scrambled[sym] = Math.max(1, scrambled[sym] + Math.floor((Math.random() - 0.5) * 16));
      }
      return scrambled;
    }

    const mods = RIFT_MODIFIERS[this.effectiveTier()];
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
