import { create } from 'zustand';
import {
  SpinResult, SlotSymbol, SpinOutcomeType, slotsEngine, TemporalRiftTier, RIFT_COSTS,
  MultiSpinResult, ReelWindow, WinLine, WinLineId, ACTIVE_LINES_5X5,
} from '@/services/SlotsEngine';
import { useDroneStore } from '@/store/useDroneStore';
import { useHabitatStore, getGridConfig } from '@/store/useHabitatStore';
import { writeUserResources } from '@/services/FirestoreService';
import { anomalyService } from '@/services/AnomalyService';
import { getMaxSpins, getOutpostPrestigeMultiplier } from '@/models/Habitat';
import { getCardDefinition, SHRED_VALUE_CR } from '@/models/Card';
import {
  computePostSpinModifiers,
  defaultPostSpinModifiers,
  getActiveReelEffect,
  pickEngineLayoutEffect,
  pickEngineWeightEffect,
  rollCardDrop,
  totalCardCount,
  cardSpinDuration,
} from '@/services/CardService';
import type { CardDrop } from '@/services/CardService';
import { logCardEvent } from '@/services/CardTelemetry';
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

const MAX_SPINS = 50; // generic cap for non-spin resource counts (attacks, raids, etc.)
const SPIN_REFILL_MS = 5 * 60_000; // 1 spin every 5 minutes

function getSpinCap(): number {
  const barracksLevel = useHabitatStore.getState().buildingLevels['BARRACKS'] ?? 0;
  return getMaxSpins(barracksLevel);
}
export const SPIN_ANIM_MS = 2200;  // reel animation duration — must match ReelDisplay

interface Resources {
  credits: number;
  // Stardust (✦) — premium soft currency used to skip build timers.
  // Earned via jackpots, outpost level-ups, and blackjack-extraction wins;
  // also bought as IAP packs (see StoreService.STARDUST_PACKS).
  stardust: number;
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
  // Daily login streak — written by the claimDailyReward Cloud Function.
  lastDailyClaimAt: number;
  dailyClaimStreak: number;
  // Card system. `cards` is the sparse inventory map; `activeReelCard` is
  // armed for the next spin; `activeReelCardSpinsLeft` is the remaining
  // spin count for multi-spin effects (drained each spin, cleared at 0).
  cards: Record<string, number>;
  activeReelCard: string | null;
  activeReelCardSpinsLeft: number;
  // Per-card-session state. Snapshotted at activate, mutated during spin,
  // cleared on consumption. See FirestoreService.UserResourceSnapshot for
  // the full contract.
  lockedAnomalyId: string | null;
  lastWinningSymbol: string | null;
  cardWinStreak: number;
  lockedCellsSymbols: string[];
  // Vengeance window — server writes these on successful incoming raids.
  // Map of attackerUid → expiry ms. The UI uses this to surface
  // "VENGEANCE READY" hints in the RADAR scan against eligible targets.
  vengeanceTargets: Record<string, number>;
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
  // Surfaced for the post-spin CardDropModal. Set by spin() when the drop
  // roll lands; cleared by clearLastCardDrop() once the modal closes.
  lastCardDrop: CardDrop | null;
}

interface GameState extends Resources, SpinState {
  spin: () => SpinResult | null;
  setRiftTier: (tier: TemporalRiftTier) => void;
  consumeAttack: () => boolean;
  consumeRaid: () => boolean;
  consumeShield: () => boolean;
  addCredits: (amount: number) => void;
  subtractCredits: (amount: number) => boolean;
  addStardust: (amount: number) => void;
  subtractStardust: (amount: number) => boolean;
  refillSpins: () => void;
  tickSpinRefill: () => void;
  tickGeneratorIncome: () => void;
  activateOverclock: () => boolean;
  activateSignalBoost: () => boolean;
  subtractResources: (costs: Partial<Pick<Resources, 'credits' | 'attacks' | 'raids' | 'shields' | 'intrusions' | 'extractions'>>) => boolean;
  grantResources: (rewards: { credits?: number; stardust?: number; fuel?: number; boost?: number; shields?: number; spinRefill?: boolean }) => void;
  syncFromFirestore: (resources: Partial<Resources>) => void;
  setIsSpinning: (spinning: boolean) => void;
  debugSetResources: (delta: Partial<Resources>) => void;
  recordRaidSuffered: () => void;
  // Card-system actions (Phase B).
  activateReelCard: (cardId: string, spinDuration: number) => void;
  deactivateReelCard: () => void;
  clearLastCardDrop: () => void;
  shredCard: (cardId: string) => boolean;
}

const INITIAL_RESOURCES: Resources = {
  credits: 500,
  stardust: 0,
  attacks: 5,
  raids: 0,
  shields: 0,
  intrusions: 0,
  extractions: 0,
  spinsRemaining: 25,
  spinRefillStart: 0,
  xp: 0,
  level: 1,
  totalSpins: 0,
  totalCreditsEarned: 0,
  totalJackpots: 0,
  totalBreachesAttempted: 0,
  totalExtractionsAttempted: 0,
  totalRaidsSuffered: 0,
  lastDailyClaimAt: 0,
  dailyClaimStreak: 0,
  cards: {},
  activeReelCard: null,
  activeReelCardSpinsLeft: 0,
  lockedAnomalyId: null,
  lastWinningSymbol: null,
  cardWinStreak: 0,
  lockedCellsSymbols: [],
  vengeanceTargets: {},
};

const XP_PER_SPIN = 5;
const XP_PER_LEVEL = (level: number) => 100 * level;

// Idle-tick writes (generator income, spin refill) coalesce locally and flush
// to Firestore at most once per PERSIST_COALESCE_MS. Any user-driven persist
// flushes the pending buffer immediately.
const PERSIST_COALESCE_MS = 5 * 60_000;
let pendingPersist: Partial<Resources> = {};
let lastPersistAt = Date.now();

export function flushPendingPersist() {
  if (Object.keys(pendingPersist).length === 0) return;
  const uid = auth.currentUser?.uid;
  if (uid) writeUserResources(uid, pendingPersist).catch(console.error);
  pendingPersist = {};
  lastPersistAt = Date.now();
}

// Echo / cascade chain tracker. Module-level (not persisted) — represents
// "free spins owed to the player from a chain-card trigger". Each free spin
// drains one count. A losing spin during the chain terminates it early
// (cascade semantics: "cascade until no win").
let pendingChainSpins = 0;
let chainCardId: string | null = null;
// True for the duration of a single chain spin so spin() knows to skip the
// spinsRemaining decrement.
let consumingChainSpin = false;

function persistResources(data: Partial<Resources>) {
  pendingPersist = { ...pendingPersist, ...data };
  flushPendingPersist();
}

function persistResourcesCoalesced(data: Partial<Resources>) {
  pendingPersist = { ...pendingPersist, ...data };
  if (Date.now() - lastPersistAt >= PERSIST_COALESCE_MS) {
    flushPendingPersist();
  }
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
  lastCardDrop: null,

  spin() {
    const {
      spinsRemaining, riftTier, credits, spinRefillStart,
      overclockActive, signalBoostActive,
      xp, level, attacks, raids, shields, intrusions, extractions,
      spinHistory, sessionSpins, sessionCreditsEarned,
      totalSpins, totalCreditsEarned, totalJackpots,
      activeReelCard, activeReelCardSpinsLeft, cards,
      lockedAnomalyId, lastWinningSymbol, cardWinStreak, lockedCellsSymbols,
    } = get();

    const isChainSpin = consumingChainSpin;
    if (!isChainSpin && (spinsRemaining <= 0 || get().isSpinning)) return null;
    if (isChainSpin && get().isSpinning) return null;

    // Active reel card: resolve before any cost is charged so a freeRift /
    // riftRefund effect can adjust the rift spend.
    const reelEffect = getActiveReelEffect(activeReelCard);
    const cardTotalSpins = activeReelCard ? cardSpinDuration(activeReelCard) : 0;
    const spinsConsumedSoFar = activeReelCard
      ? Math.max(0, cardTotalSpins - activeReelCardSpinsLeft)
      : 0;
    const preBoosted = computePostSpinModifiers(reelEffect, {
      riftTier, anomalyId: null, result: {
        reels: ['EMPTY', 'EMPTY', 'EMPTY'], outcomeType: 'NOTHING',
        creditsWon: 0, attacksWon: 0, raidsWon: 0, shieldsWon: 0,
        intrusionsWon: 0, extractionsWon: 0, isJackpot: false,
      },
      winLines: [], numActiveLines: 1,
      spinsConsumedSoFar, cardWinStreak, lockedAnomalyId,
    });
    const rawRiftCost = RIFT_COSTS[riftTier];
    const riftRefund = Math.floor(rawRiftCost * preBoosted.riftRefundPct);
    const riftCost = preBoosted.freeRift ? 0 : Math.max(0, rawRiftCost - riftRefund);
    if (riftCost > credits) return null;
    // void_tap fuel gate — refuse the spin if the player can't pay.
    if (preBoosted.fuelCost > attacks) return null;

    const outpostLevel = useHabitatStore.getState().outpostLevel;
    const grid = getGridConfig(outpostLevel);
    // Extra lines from reel_extra_lines round up to the next supported tier
    // (1 / 3 / 5). The engine only registers ACTIVE_LINES for these three.
    const extraLines = reelEffect?.kind === 'reel_extra_lines' ? reelEffect.count : 0;
    const linesForRows: 1 | 3 | 5 = (() => {
      const target = grid.numLines + extraLines;
      if (target >= 5) return 5;
      if (target >= 3) return 3;
      return 1;
    })();

    slotsEngine.setRiftTier(riftTier);
    slotsEngine.setActiveCardWeightEffect(pickEngineWeightEffect(reelEffect, { lastWinningSymbol }));
    slotsEngine.setActiveCardLayoutEffect(pickEngineLayoutEffect(reelEffect, { lockedCellsSymbols }));
    if (signalBoostActive) slotsEngine.setSignalBoost(true);
    const multi = grid.size === '5x5'
      ? slotsEngine.spinGrid(5, 5, ACTIVE_LINES_5X5)
      : slotsEngine.spinRows(linesForRows);
    if (signalBoostActive) slotsEngine.setSignalBoost(false);
    slotsEngine.setActiveCardWeightEffect(null);
    slotsEngine.setActiveCardLayoutEffect(null);

    const midRowIdx = Math.floor(multi.reelWindow.length / 2);
    const midRow = multi.reelWindow[midRowIdx];
    const result: SpinResult = {
      reels: [midRow[0], midRow[1] ?? midRow[0], midRow[2] ?? midRow[0]],
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
    // reel_anomaly_lock: substitute the snapshotted anomaly id for this
    // spin's anomaly reads.
    const liveAnomalyDef = anomalyService.getDefinition();
    const lockedAnomalyDef = preBoosted.anomalyIdOverride
      ? anomalyService.getDefinitionForId(preBoosted.anomalyIdOverride) ?? liveAnomalyDef
      : liveAnomalyDef;
    const baseAnomalyMultiplier = lockedAnomalyDef?.creditMultiplier ?? 1;
    const anomalyId = lockedAnomalyDef?.id ?? null;
    const prestigeMultiplier = getOutpostPrestigeMultiplier(outpostLevel);

    // Post-spin card modifiers — computed once we have the real result so
    // gates like reel_stardust_on_big_win can inspect the credit total.
    const cardMods = reelEffect
      ? computePostSpinModifiers(reelEffect, {
          riftTier, anomalyId, result, winLines: multi.winLines, numActiveLines: linesForRows,
          spinsConsumedSoFar, cardWinStreak, lockedAnomalyId,
        })
      : defaultPostSpinModifiers();
    const effectiveAnomaly = baseAnomalyMultiplier * cardMods.anomalyAmplifier;
    const jackpotFactor = result.isJackpot ? cardMods.jackpotMultiplier : 1;
    const boostedCreditsWon =
      Math.floor(
        result.creditsWon
          * droneEffects.creditMultiplier
          * effectiveAnomaly
          * prestigeMultiplier
          * cardMods.payoutMultiplier
          * jackpotFactor,
      )
      + cardMods.flatCreditBonus
      + overclockBonus;

    // Pre-calculate all resource changes using values captured at spin time
    const newCredits = Math.max(0, credits - riftCost + boostedCreditsWon);
    const newXp = xp + XP_PER_SPIN + (result.isJackpot ? 20 : 0);
    const xpNeeded = XP_PER_LEVEL(level);
    const leveledUp = newXp >= xpNeeded;
    const newRefillStart = spinRefillStart === 0 ? Date.now() : spinRefillStart;

    // Stardust drip: jackpots → 5 ✦; reel_stardust_on_big_win adds on top.
    const stardustGain = (result.isJackpot ? 5 : 0) + cardMods.stardustGain;

    // Track per-card-session state for hot_streak / streak_bonus / compound.
    const didWin = result.outcomeType !== 'NOTHING';
    const winningSymbol = didWin && multi.winLines[0]
      ? multi.winLines[0].result.reels[0]
      : lastWinningSymbol;
    const nextCardWinStreak = activeReelCard
      ? (didWin ? cardWinStreak + 1 : 0)
      : cardWinStreak;

    // lock_cells: snapshot the first N cells of the current mid row so the
    // NEXT spin can pin them via pickEngineLayoutEffect. We capture this
    // unconditionally — the layout effect only fires when the card stays
    // armed for the next spin.
    let nextLockedCellsSymbols = lockedCellsSymbols;
    if (reelEffect?.kind === 'reel_lock_cells') {
      nextLockedCellsSymbols = midRow.slice(0, reelEffect.cells);
    }

    // Drain the active reel card's spin counter; clear when exhausted.
    // Echo / cascade re-spins re-arm the same card for one more spin
    // without consuming spinsLeft (handled below via the queued echo).
    let nextActiveCard: string | null = activeReelCard;
    let nextActiveCardSpinsLeft = activeReelCardSpinsLeft;
    let nextLockedAnomalyId: string | null = lockedAnomalyId;
    if (activeReelCard) {
      nextActiveCardSpinsLeft = Math.max(0, activeReelCardSpinsLeft - 1);
      if (nextActiveCardSpinsLeft <= 0) {
        nextActiveCard = null;
        nextActiveCardSpinsLeft = 0;
        nextLockedCellsSymbols = []; // session ended; clear locked cells
        nextLockedAnomalyId = null;
      }
    }

    // Card drop roll. The drop applies after the animation completes (Phase
    // 2 below) so the modal pops over the resolved reel state.
    const cardDrop = rollCardDrop(totalCardCount(cards));
    let nextCards = cards;
    let dropCreditBonus = 0;
    if (cardDrop) {
      if (cardDrop.autoShredded) {
        dropCreditBonus = cardDrop.shredCredits;
      } else {
        const cardId = cardDrop.card.id;
        nextCards = { ...cards, [cardId]: (cards[cardId] ?? 0) + 1 };
      }
      void logCardEvent({
        kind: 'DROP',
        cardId: cardDrop.card.id,
        tier: cardDrop.card.tier,
        rarity: cardDrop.card.rarity,
        autoShredded: cardDrop.autoShredded,
      });
    }

    const nextState: Partial<Resources> = {
      credits: newCredits + dropCreditBonus,
      stardust: get().stardust + stardustGain,
      // void_tap fuel cost is paid out of the ATTACK token pool.
      attacks:     Math.min(MAX_SPINS, Math.max(0, attacks - cardMods.fuelCost) + result.attacksWon + cardMods.tokenBumps.attacks),
      raids:       Math.min(MAX_SPINS, raids       + result.raidsWon       + cardMods.tokenBumps.raids),
      shields:     Math.min(MAX_SPINS, shields     + result.shieldsWon     + cardMods.tokenBumps.shields),
      intrusions:  Math.min(MAX_SPINS, intrusions  + result.intrusionsWon),
      extractions: Math.min(MAX_SPINS, extractions + result.extractionsWon),
      // Chain spins (echo / cascade follow-ups) don't drain energy.
      spinsRemaining: isChainSpin ? spinsRemaining : spinsRemaining - 1,
      spinRefillStart: newRefillStart,
      xp: leveledUp ? newXp - xpNeeded : newXp,
      level: leveledUp ? level + 1 : level,
      cards: nextCards,
      activeReelCard: nextActiveCard,
      activeReelCardSpinsLeft: nextActiveCardSpinsLeft,
      lastWinningSymbol: winningSymbol,
      cardWinStreak: nextCardWinStreak,
      lockedCellsSymbols: nextLockedCellsSymbols,
      lockedAnomalyId: nextLockedAnomalyId,
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
      anomalyMultiplier: effectiveAnomaly,
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

    // Echo / cascade chain queuing. The original spin (not isChainSpin)
    // *starts* the chain; subsequent chain spins drain pendingChainSpins
    // and re-arm the same card so the card's effects apply again. A
    // losing spin during the chain terminates it early.
    const echoesToQueue = cardMods.echoSpinsToQueue;
    const willStartChain = !isChainSpin && echoesToQueue > 0 && activeReelCard !== null;
    const willContinueChain = isChainSpin && didWin && pendingChainSpins > 0;
    if (willStartChain) {
      pendingChainSpins = echoesToQueue;
      chainCardId = activeReelCard;
    }
    if (willStartChain || willContinueChain) {
      // Re-arm the card so the next chain spin sees it active.
      nextState.activeReelCard = chainCardId;
      nextState.activeReelCardSpinsLeft = 1;
    } else if (isChainSpin) {
      // Chain ended (no win, or no budget remaining). Tear down.
      pendingChainSpins = 0;
      chainCardId = null;
    }

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
        lastCardDrop: cardDrop,
      });
      persistResources(nextState);

      // Schedule the next chain spin if appropriate.
      const shouldChain = (willStartChain || willContinueChain) && pendingChainSpins > 0;
      if (shouldChain) {
        pendingChainSpins -= 1;
        setTimeout(() => {
          const next = get();
          if (next.activeReelCard === chainCardId && !next.isSpinning) {
            consumingChainSpin = true;
            try {
              next.spin();
            } finally {
              consumingChainSpin = false;
            }
          } else {
            // Card was deactivated mid-chain; abort.
            pendingChainSpins = 0;
            chainCardId = null;
          }
        }, 80);
      }
    }, SPIN_ANIM_MS);

    return result;
  },

  activateReelCard(cardId, spinDuration) {
    const { cards } = get();
    const count = cards[cardId] ?? 0;
    if (count <= 0) return;
    const nextCards = { ...cards };
    if (count === 1) delete nextCards[cardId];
    else nextCards[cardId] = count - 1;
    // Per-card-session state snapshots.
    //   reel_anomaly_lock — snapshots the currently-active anomaly id.
    //   reel_lock_cells   — snapshots the LAST spin's mid-row cells so the
    //                       next spin can pin them. Without this trick the
    //                       1-spin card would have nothing to pin.
    const def = getCardDefinition(cardId);
    const eff = def?.effects[0];
    const lockedAnomalyId = eff?.kind === 'reel_anomaly_lock'
      ? (anomalyService.getDefinition()?.id ?? null)
      : null;
    let lockedCellsSymbols: string[] = [];
    if (eff?.kind === 'reel_lock_cells') {
      const prevWindow = get().reelWindow;
      const midRow = prevWindow?.[Math.floor(prevWindow.length / 2)];
      if (midRow) lockedCellsSymbols = midRow.slice(0, eff.cells);
    }
    const next: Partial<Resources> = {
      cards: nextCards,
      activeReelCard: cardId,
      activeReelCardSpinsLeft: Math.max(1, spinDuration),
      lockedAnomalyId,
      cardWinStreak: 0,
      lockedCellsSymbols,
    };
    set(next);
    persistResources(next);
    void logCardEvent({ kind: 'ACTIVATE_REEL', cardId, spinDuration });
  },

  deactivateReelCard() {
    const { activeReelCard, cards } = get();
    if (!activeReelCard) return;
    // Refund the card to inventory so deactivation isn't punitive.
    const nextCards = { ...cards, [activeReelCard]: (cards[activeReelCard] ?? 0) + 1 };
    const next: Partial<Resources> = {
      cards: nextCards,
      activeReelCard: null,
      activeReelCardSpinsLeft: 0,
      lockedAnomalyId: null,
      cardWinStreak: 0,
      lockedCellsSymbols: [],
    };
    set(next);
    persistResources(next);
    // Cancel any pending chain spins from echo/cascade.
    pendingChainSpins = 0;
    chainCardId = null;
  },

  clearLastCardDrop() {
    set({ lastCardDrop: null });
  },

  shredCard(cardId) {
    const { cards } = get();
    const count = cards[cardId] ?? 0;
    if (count <= 0) return false;
    const def = getCardDefinition(cardId);
    if (!def) return false;
    const refund = SHRED_VALUE_CR[def.tier];
    const nextCards = { ...cards };
    if (count === 1) delete nextCards[cardId];
    else nextCards[cardId] = count - 1;
    const next: Partial<Resources> = {
      cards: nextCards,
      credits: get().credits + refund,
    };
    set(next);
    persistResources(next);
    void logCardEvent({ kind: 'SHRED', cardId, refundCredits: refund });
    return true;
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
        persistResourcesCoalesced(update);
      } else {
        const msInCycle = now - newRefillStart;
        const msUntilNextSpin = SPIN_REFILL_MS - msInCycle;
        const spinsNeeded = spinCap - newSpins;
        const msUntilFull = msUntilNextSpin + (spinsNeeded - 1) * SPIN_REFILL_MS;
        const update = { spinsRemaining: newSpins, spinRefillStart: newRefillStart };
        set({ ...update, msUntilNextSpin, msUntilFull });
        persistResourcesCoalesced(update);
      }
    } else {
      const msUntilNextSpin = SPIN_REFILL_MS - (elapsed % SPIN_REFILL_MS);
      const spinsNeeded = spinCap - spinsRemaining;
      const msUntilFull = msUntilNextSpin + (spinsNeeded - 1) * SPIN_REFILL_MS;
      set({ msUntilNextSpin, msUntilFull });
    }
  },

  activateOverclock() {
    const { attacks, overclockActive } = get();
    if (overclockActive) {
      const next = { attacks: attacks + 1 };
      set({ ...next, overclockActive: false });
      persistResources(next);
      return false;
    }
    if (attacks <= 0) return false;
    const next = { attacks: attacks - 1 };
    set({ ...next, overclockActive: true });
    persistResources(next);
    return true;
  },

  activateSignalBoost() {
    const { raids, signalBoostActive } = get();
    if (signalBoostActive) {
      const next = { raids: raids + 1 };
      set({ ...next, signalBoostActive: false });
      persistResources(next);
      return false;
    }
    if (raids <= 0) return false;
    const next = { raids: raids - 1 };
    set({ ...next, signalBoostActive: true });
    persistResources(next);
    return true;
  },

  tickGeneratorIncome() {
    const genLevel = useHabitatStore.getState().buildingLevels['GENERATOR'] ?? 0;
    if (genLevel === 0) return;
    const income = genLevel * 20;
    const next = { credits: get().credits + income };
    set(next);
    persistResourcesCoalesced(next);
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

  addStardust(amount) {
    if (amount <= 0) return;
    const next = { stardust: get().stardust + amount };
    set(next);
    persistResources(next);
  },

  subtractStardust(amount) {
    const { stardust } = get();
    if (stardust < amount) return false;
    const next = { stardust: stardust - amount };
    set(next);
    persistResources(next);
    return true;
  },

  refillSpins() {
    const next = { spinsRemaining: getSpinCap(), spinRefillStart: 0 };
    set(next);
    persistResources(next);
  },

  grantResources(rewards) {
    const s = get();
    const next: Partial<Resources> = {};
    if (rewards.credits)  next.credits  = s.credits  + rewards.credits;
    if (rewards.stardust) next.stardust = s.stardust + rewards.stardust;
    if (rewards.fuel)     next.attacks  = Math.min(MAX_SPINS, s.attacks + rewards.fuel);
    if (rewards.boost)    next.raids    = Math.min(MAX_SPINS, s.raids   + rewards.boost);
    if (rewards.shields)  next.shields  = Math.min(MAX_SPINS, s.shields + rewards.shields);
    if (rewards.spinRefill) {
      next.spinsRemaining  = getSpinCap();
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
      if (merged.spinsRemaining < getSpinCap() && merged.spinRefillStart === 0) {
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
        spinsRemaining: Math.min(getSpinCap(), Math.max(0, s.spinsRemaining + (delta.spinsRemaining ?? 0))),
      };
      persistResources(next);
      return { ...s, ...next };
    });
  },

  recordRaidSuffered() {
    set((s) => {
      const next = { totalRaidsSuffered: s.totalRaidsSuffered + 1 };
      persistResources(next);
      return next;
    });
  },
}));
