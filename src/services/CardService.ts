import {
  CARD_CATALOG,
  CARD_DROP_CHANCE,
  CARD_TIER_MAJOR_CHANCE,
  CARD_REEL_VS_RAID,
  CARD_INVENTORY_CAP,
  SHRED_VALUE_CR,
  getCardDefinition,
} from '@/models/Card';
import type {
  CardCategory,
  CardDefinition,
  CardEffect,
  CardRarity,
  CardTier,
  ReelEffect,
} from '@/models/Card';
import type { SlotSymbol, SpinResult, WinLine } from '@/services/SlotsEngine';

// ---------------------------------------------------------------------------
// Drop logic — pure client-side. Same trust model as credits/spins (the user
// can grant themselves cards in their own user doc; not a new attack surface).
//
// IMPLEMENTED_EFFECT_KINDS limits which cards can actually drop in v1. Cards
// whose effect kind isn't in this list never roll — keeps the player from
// activating a card that no-ops. Phase B.2 expands this list as the
// multi-spin / cascade / layout effects come online.
// ---------------------------------------------------------------------------

const IMPLEMENTED_REEL_EFFECT_KINDS: ReelEffect['kind'][] = [
  'reel_weight_multiplier',
  'reel_empty_reduction',
  'reel_payout_multiplier',
  'reel_jackpot_multiplier',
  'reel_line_multiplier',
  'reel_extra_lines',
  'reel_anomaly_amplify',
  'reel_rift_free',
  'reel_rift_payout_gate',
  'reel_rift_tier_boost',
  'reel_quartermaster',
  'reel_guarantee_drop',
  'reel_stardust_on_big_win',
  'reel_anomaly_gated_bonus',
  'reel_tier_echo',
  // Phase E.2 — full reel coverage
  'reel_symbol_convert',
  'reel_compound',
  'reel_rift_refund',
  'reel_void_tap',
  'reel_anomaly_lock',
  'reel_hot_streak',
  'reel_streak_bonus',
  'reel_echo_chance',
  'reel_layout_force',
  'reel_cascade',
  'reel_lock_cells',
];

// Phase C/C.2 raid effects wired in functions/src/index.ts:resolveCombat.
// Cards whose effects aren't in this list never drop so players don't see
// no-ops. Mini-game-touching effects (mini_game_rerolls, reroll_mini_game,
// remove_wheel_slot) stay off the drop pool until the roulette/blackjack
// components get their animation passes in Phase E.
const IMPLEMENTED_RAID_EFFECT_KINDS = new Set<string>([
  'raid_power_delta',
  'raid_defender_power_delta',
  'raid_bust_to_power',
  'raid_vault_ignore',
  'raid_tax_collector',
  'raid_smash_grab',
  'raid_token_refund_on_win',
  'raid_token_refund_on_loss_pct',
  'raid_no_consume_on_bust',
  'raid_no_consume_on_loss',
  'raid_disable_turret_on_jackpot',
  'raid_sabotage_spins_on_win',
  'raid_power_per_turret_charge',
  'raid_ignore_turret_charges',
  'raid_all_in',
  'raid_lucky_range',
  'raid_loss_penalty_bonus',
  'raid_threat_index',
  'raid_cooldown_bypass',
  'raid_drone_synergy',
  'raid_drone_disrupt',
  // C.2 additions
  'raid_smoke_screen',
  'raid_pursuit_beacon',
  'raid_extra_token_cost',
  'raid_anomaly_shift',
  'raid_sector_specialist',
  'raid_vengeance_bonus',
  'raid_wager',
  // Phase E: mini-game effects wired in RouletteGame / BlackjackMiniGame.
  'raid_mini_game_rerolls',
  'raid_remove_wheel_slot',
  'raid_reroll_mini_game',
]);

function isCardImplemented(card: CardDefinition): boolean {
  if (card.category === 'REEL') {
    return card.effects.every((e) => IMPLEMENTED_REEL_EFFECT_KINDS.includes(e.kind as ReelEffect['kind']));
  }
  // Raid cards: drop only when every effect kind is wired server-side.
  return card.effects.every((e) => IMPLEMENTED_RAID_EFFECT_KINDS.has(e.kind));
}

// Rarity drop weights. RARE/EPIC cards are correspondingly rarer within their
// (category, tier) bucket — keeps the broader minor/major split intact while
// adding a second axis of scarcity.
const RARITY_WEIGHTS: Record<CardRarity, number> = {
  COMMON:   60,
  UNCOMMON: 30,
  RARE:     8,
  EPIC:     2,
};

export interface CardDrop {
  card: CardDefinition;
  autoShredded: boolean; // true when inventory was at cap; CR was credited instead
  shredCredits: number;
}

// Roll for a card drop. Returns null if no drop. Inventory cap behavior:
// caller passes current total card count; if cap is reached, the drop is
// auto-shredded into CR (no modal pop, just a small CR bump).
export function rollCardDrop(currentCardCount: number): CardDrop | null {
  if (Math.random() >= CARD_DROP_CHANCE) return null;

  const tier: CardTier = Math.random() < CARD_TIER_MAJOR_CHANCE ? 'MAJOR' : 'MINOR';
  const category: CardCategory = Math.random() < CARD_REEL_VS_RAID ? 'REEL' : 'RAID';

  const bucket = CARD_CATALOG.filter(
    (c) => c.tier === tier && c.category === category && isCardImplemented(c),
  );
  if (bucket.length === 0) return null;

  const totalWeight = bucket.reduce((sum, c) => sum + RARITY_WEIGHTS[c.rarity], 0);
  let roll = Math.random() * totalWeight;
  let chosen: CardDefinition = bucket[0];
  for (const card of bucket) {
    roll -= RARITY_WEIGHTS[card.rarity];
    if (roll <= 0) { chosen = card; break; }
  }

  const autoShredded = currentCardCount >= CARD_INVENTORY_CAP;
  return {
    card: chosen,
    autoShredded,
    shredCredits: autoShredded ? SHRED_VALUE_CR[chosen.tier] : 0,
  };
}

export function totalCardCount(cards: Record<string, number>): number {
  return Object.values(cards).reduce((sum, n) => sum + n, 0);
}

// ---------------------------------------------------------------------------
// Effect application helpers — consumed by useGameStore.spin.
//
// Pre-spin: the engine handles weight / Rift-tier effects directly via
// `setActiveCardWeightEffect`. Post-evaluate effects (payout multipliers,
// resource bumps, stardust drops, etc.) flow through `computePostSpinModifiers`
// which the store then folds into the existing multiplier stack.
// ---------------------------------------------------------------------------

export interface PostSpinModifiers {
  // Multiplier applied to creditsWon AFTER drone/anomaly/prestige/overclock.
  payoutMultiplier: number;
  // Jackpot-only multiplier (multiplied with payoutMultiplier on jackpot hits).
  jackpotMultiplier: number;
  // Flat credits added (per-line bonuses, etc.) on top of the multiplied total.
  flatCreditBonus: number;
  // Extra anomaly multiplier — multiplied into the existing anomaly value.
  anomalyAmplifier: number;
  // Bonus stardust to grant this spin (e.g. stardust_on_big_win).
  stardustGain: number;
  // Per-token additive bumps (quartermaster, guarantee_drop).
  tokenBumps: { attacks: number; raids: number; shields: number };
  // True when the card refunds the full Rift cost for this spin.
  freeRift: boolean;
  // Fractional rift-cost refund (0..1). reel_rift_refund applies this on
  // each spin during the card's window.
  riftRefundPct: number;
  // void_tap (Rift 3 only): consume this much fuel for the multiplier to fire.
  fuelCost: number;
  // anomaly_lock override — when non-null, the engine should read this
  // anomaly id instead of the live one.
  anomalyIdOverride: string | null;
  // Schedule an echo / cascade re-spin chain. When > 0 the store will
  // queue that many extra spins on the next tick. Triggered only on a
  // winning spin (echo_chance) or unconditionally on win (cascade).
  echoSpinsToQueue: number;
}

export function defaultPostSpinModifiers(): PostSpinModifiers {
  return {
    payoutMultiplier: 1,
    jackpotMultiplier: 1,
    flatCreditBonus: 0,
    anomalyAmplifier: 1,
    stardustGain: 0,
    tokenBumps: { attacks: 0, raids: 0, shields: 0 },
    freeRift: false,
    riftRefundPct: 0,
    fuelCost: 0,
    anomalyIdOverride: null,
    echoSpinsToQueue: 0,
  };
}

interface PostSpinContext {
  riftTier: 0 | 1 | 2 | 3;
  anomalyId: string | null;
  result: SpinResult;
  winLines: WinLine[];
  numActiveLines: number;
  // Per-card-session state read from the store. spinsConsumedSoFar starts
  // at 0 on the first spin of a card session and increments each spin —
  // used by reel_compound to ramp the multiplier and reel_streak_bonus
  // (which also factors in cardWinStreak).
  spinsConsumedSoFar: number;
  cardWinStreak: number;
  lockedAnomalyId: string | null;
}

export function computePostSpinModifiers(
  effect: ReelEffect | null,
  ctx: PostSpinContext,
): PostSpinModifiers {
  const mods = defaultPostSpinModifiers();
  if (!effect) return mods;

  switch (effect.kind) {
    case 'reel_payout_multiplier':
      mods.payoutMultiplier = effect.multiplier;
      break;
    case 'reel_jackpot_multiplier':
      if (ctx.result.isJackpot) mods.jackpotMultiplier = effect.multiplier;
      break;
    case 'reel_line_multiplier': {
      // Flat bonus on top of the already-summed creditsWon. Each affected
      // winning line contributes (multiplier - 1) × its credit yield.
      let bonus = 0;
      for (const wl of ctx.winLines) {
        if (effect.lines.includes(wl.id)) {
          bonus += wl.result.creditsWon * (effect.multiplier - 1);
        }
      }
      mods.flatCreditBonus = bonus;
      break;
    }
    case 'reel_anomaly_amplify':
      mods.anomalyAmplifier = effect.multiplier;
      break;
    case 'reel_anomaly_gated_bonus':
      if (ctx.anomalyId && effect.anomalies.includes(ctx.anomalyId)) {
        mods.payoutMultiplier = 1 + effect.bonusPct;
      }
      break;
    case 'reel_rift_payout_gate':
      if (ctx.riftTier >= effect.minTier) {
        mods.payoutMultiplier = 1 + effect.bonusPct;
      }
      break;
    case 'reel_rift_free':
      mods.freeRift = true;
      break;
    case 'reel_quartermaster':
      mods.tokenBumps = {
        attacks: effect.perToken,
        raids:   effect.perToken,
        shields: effect.perToken,
      };
      break;
    case 'reel_guarantee_drop': {
      // Bump up to the minimum if the spin under-delivered.
      const need = (cur: number) => Math.max(0, effect.min - cur);
      if (effect.resource === 'any_combat') {
        // Distribute the minimum across the three combat tokens evenly.
        const totalNow =
          ctx.result.attacksWon + ctx.result.raidsWon + ctx.result.shieldsWon;
        const shortfall = Math.max(0, effect.min - totalNow);
        if (shortfall > 0) {
          // Drop the whole shortfall on attacks for simplicity; refining the
          // distribution can come in Phase B.2 once we see how it plays.
          mods.tokenBumps = { attacks: shortfall, raids: 0, shields: 0 };
        }
      } else if (effect.resource === 'fuel') {
        mods.tokenBumps = { ...mods.tokenBumps, attacks: need(ctx.result.attacksWon) };
      } else if (effect.resource === 'boost') {
        mods.tokenBumps = { ...mods.tokenBumps, raids: need(ctx.result.raidsWon) };
      } else if (effect.resource === 'shield') {
        mods.tokenBumps = { ...mods.tokenBumps, shields: need(ctx.result.shieldsWon) };
      }
      break;
    }
    case 'reel_stardust_on_big_win':
      if (ctx.result.creditsWon >= effect.creditThreshold) {
        mods.stardustGain = effect.stardust;
      }
      break;
    case 'reel_tier_echo':
      mods.payoutMultiplier = 1 + effect.perLinePct * ctx.numActiveLines;
      break;
    case 'reel_rift_tier_boost':
    case 'reel_weight_multiplier':
    case 'reel_empty_reduction':
    case 'reel_symbol_convert':
    case 'reel_hot_streak':
    case 'reel_layout_force':
    case 'reel_lock_cells':
      // Handled by the engine pre-draw / post-layout; no post-spin work.
      break;
    case 'reel_extra_lines':
      // Wired through useGameStore.spin's line selection; no post-spin work.
      break;
    case 'reel_compound': {
      // Each spin during the window stacks +perSpinPct, starting with the
      // first spin (so the +5% / +10% feels rewarding immediately). The
      // store passes spinsConsumedSoFar = 0 on the first spin of the
      // session, 1 on the second, etc.
      mods.payoutMultiplier = 1 + effect.perSpinPct * (ctx.spinsConsumedSoFar + 1);
      break;
    }
    case 'reel_streak_bonus': {
      // +perWinPct per consecutive winning spin, capped.
      const raw = effect.perWinPct * ctx.cardWinStreak;
      mods.payoutMultiplier = 1 + Math.min(raw, effect.cap);
      break;
    }
    case 'reel_rift_refund':
      mods.riftRefundPct = effect.pct;
      break;
    case 'reel_void_tap':
      // Rift 3 gate — outside Rift 3 the card is consumed but does nothing.
      if (ctx.riftTier === 3) {
        mods.payoutMultiplier = effect.payoutMultiplier;
        mods.fuelCost = effect.fuelCost;
      }
      break;
    case 'reel_anomaly_lock':
      mods.anomalyIdOverride = ctx.lockedAnomalyId;
      break;
    case 'reel_echo_chance':
      // Win-gated: only queue echoes if the current spin actually won.
      if (ctx.result.outcomeType !== 'NOTHING' && Math.random() < effect.chance) {
        mods.echoSpinsToQueue = effect.maxExtra;
      }
      break;
    case 'reel_cascade':
      // Win-gated; queue a re-spin chain. Major (maxChain=10) cascades
      // until no win — implemented as "queue 1 extra, the next spin can
      // queue another if it also wins (handled by the store loop)."
      if (ctx.result.outcomeType !== 'NOTHING') {
        mods.echoSpinsToQueue = effect.maxChain;
      }
      break;
    default:
      // Exhaustive switch — TS guarantees no fall-through.
      break;
  }

  return mods;
}

// Convenience for the engine pre-draw setup.
export function pickEngineWeightEffect(
  effect: ReelEffect | null,
  ctx: { lastWinningSymbol?: string | null } = {},
) {
  if (!effect) return null;
  if (effect.kind === 'reel_weight_multiplier') {
    return { kind: 'weight_multiplier' as const, symbols: effect.symbols, multiplier: effect.multiplier };
  }
  if (effect.kind === 'reel_empty_reduction') {
    return { kind: 'empty_reduction' as const, ratio: effect.ratio };
  }
  if (effect.kind === 'reel_rift_tier_boost') {
    return { kind: 'rift_tier_boost' as const, delta: effect.delta };
  }
  if (effect.kind === 'reel_symbol_convert') {
    return { kind: 'symbol_convert' as const, from: effect.from, to: effect.to };
  }
  if (effect.kind === 'reel_hot_streak') {
    // Bias toward the previous winning symbol. If the player hasn't won yet,
    // fall back to the highest-value credit symbol so the card still does
    // something on the first spin.
    const fallback = 'CREDIT_LARGE' as const;
    const symbol = (ctx.lastWinningSymbol ?? fallback) as SlotSymbol;
    return { kind: 'symbol_bias' as const, symbol, multiplier: effect.symbolBonusPct };
  }
  return null;
}

// Returns a layout effect for the engine to apply post-draw. Includes the
// lock_cells carry-over (using cells captured from the previous spin) and
// layout_force (mirror / mid_row_match / etc).
export function pickEngineLayoutEffect(
  effect: ReelEffect | null,
  ctx: { lockedCellsSymbols?: string[] } = {},
) {
  if (!effect) return null;
  if (effect.kind === 'reel_layout_force') {
    return { kind: 'layout_force' as const, mode: effect.mode };
  }
  if (effect.kind === 'reel_lock_cells') {
    const carried = ctx.lockedCellsSymbols ?? [];
    if (carried.length === 0) return null;
    return { kind: 'lock_cells' as const, symbols: carried.slice(0, effect.cells) as SlotSymbol[] };
  }
  return null;
}

// Lookup the catalog effect for an active card id, or null if missing /
// not a reel card.
export function getActiveReelEffect(cardId: string | null): ReelEffect | null {
  if (!cardId) return null;
  const def = getCardDefinition(cardId);
  if (!def || def.category !== 'REEL') return null;
  // Single-effect cards for v1; if a major card lists 2 reel effects, only
  // the first is applied this phase.
  const eff = def.effects[0] as CardEffect;
  if (!eff || !eff.kind.startsWith('reel_')) return null;
  return eff as ReelEffect;
}

// Spin-count for multi-spin cards. Returns 1 for single-spin effects.
export function cardSpinDuration(cardId: string): number {
  const def = getCardDefinition(cardId);
  if (!def) return 1;
  const eff = def.effects[0];
  if (!eff) return 1;
  if ('spins' in eff && typeof eff.spins === 'number') return eff.spins;
  return 1;
}

// ---------------------------------------------------------------------------
// Mini-game card effects (Phase E)
//
// Some raid cards modify the client-side mini-game itself rather than the
// resolveCombat math. The server is intentionally agnostic — it only sees
// the final attackerPower in the combat request. This helper returns the
// shape the Roulette/Blackjack components need to apply the effect.
// ---------------------------------------------------------------------------

export interface MiniGameMods {
  // Roulette: take the best of (1 + rerolls) silent spins. Used by
  // triple_threat. The wheel animates to the BEST outcome; the player
  // never sees the discarded rolls.
  rouletteExtraRolls: number;
  // Roulette: forbid landing on the N lowest-power (MISS) slots. Used by
  // stabilizer. The wheel still renders those slots but greyed out.
  rouletteRemoveSlots: number;
  // Blackjack: free redeal on a loss, up to N times. Used by reroll_module.
  blackjackRerolls: number;
}

export function getMiniGameMods(cardId: string | null | undefined): MiniGameMods {
  const def = cardId ? getCardDefinition(cardId) : null;
  const eff = def?.effects[0];
  const empty: MiniGameMods = { rouletteExtraRolls: 0, rouletteRemoveSlots: 0, blackjackRerolls: 0 };
  if (!eff) return empty;
  switch (eff.kind) {
    case 'raid_mini_game_rerolls':
      return { ...empty, rouletteExtraRolls: eff.extraSpins };
    case 'raid_remove_wheel_slot':
      return { ...empty, rouletteRemoveSlots: eff.count };
    case 'raid_reroll_mini_game':
      // 'next' (minor) = 1 retry; 'best_of_2' (major) = 2 retries so the
      // player effectively gets 3 chances against the dealer.
      return { ...empty, blackjackRerolls: eff.takes === 'next' ? 1 : 2 };
    default:
      return empty;
  }
}
