import type { SlotSymbol, WinLineId } from '@/services/SlotsEngine';

// ---------------------------------------------------------------------------
// Card system — data model
//
// Cards are consumable items the player picks up from slot drops (~1.5%/spin)
// and burns one at a time:
//   • Reel cards activate before a spin and mutate the engine for that spin
//     (or a small window of spins). See `useGameStore.activeReelCard`.
//   • Raid cards activate when launching a raid and are passed via
//     combatRequests.cardId for the Cloud Function to apply.
//
// Phase A (this file): pure data model + catalog. No effect-application logic
// lives here — Phase B wires reel effects into SlotsEngine, Phase C wires
// raid effects into resolveCombat. Effects are encoded as discriminated-union
// descriptors so the eventual apply sites can `switch (effect.kind)` and get
// an exhaustive check from the compiler.
//
// Each "concept" has two tiers (MINOR + MAJOR) sharing a baseId. Minor cards
// are the common drop; majors are rarer and either bump the same parameter
// or add a second effect.
// ---------------------------------------------------------------------------

export type CardCategory = 'REEL' | 'RAID';
export type CardTier     = 'MINOR' | 'MAJOR';
export type CardRarity   = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC';

// Synergy tags help the inventory UI surface "works with: Rift ≥ 2" and let
// the drop logic optionally bias toward cards that the current player can
// actually use.
export type CardSynergy = 'RIFT_ANY' | 'RIFT_3' | 'ANOMALY' | 'DRONE' | 'SECTOR';

// ── Effect descriptors ────────────────────────────────────────────────────

// Reel effects — applied inside SlotsEngine.spin / spinRows / spinGrid.
export type ReelEffect =
  // Symbol weight shifts on the next N spins
  | { kind: 'reel_weight_multiplier'; symbols: SlotSymbol[]; multiplier: number; spins: number }
  // Convert one symbol to another for the next N spins (e.g. CREDIT_LARGE → CREDIT_MEDIUM)
  | { kind: 'reel_symbol_convert';    from: SlotSymbol; to: SlotSymbol; spins: number }
  // Halve / zero out the EMPTY weight
  | { kind: 'reel_empty_reduction';   ratio: number; spins: number }
  // Flat payout multiplier on the next N spins (after engine evaluate)
  | { kind: 'reel_payout_multiplier'; multiplier: number; spins: number }
  // Multiplier that only applies to JACKPOT-tier wins
  | { kind: 'reel_jackpot_multiplier'; multiplier: number; spins: number }
  // Per-line bonus on the next N spins
  | { kind: 'reel_line_multiplier';   lines: WinLineId[]; multiplier: number; spins: number }
  // +N extra active paylines on the next spin (if grid supports it)
  | { kind: 'reel_extra_lines';       count: number; spins: number }
  // Re-spin on win with the given probability
  | { kind: 'reel_echo_chance';       chance: number; maxExtra: number }
  // Cascade: winning cells refill and re-evaluate
  | { kind: 'reel_cascade';           maxChain: number }
  // Force the layout: mirrored reels, all-rows-equal, etc.
  | { kind: 'reel_layout_force';      mode: 'mirror_left_right' | 'mid_row_match' | 'top_bot_mirror' | 'all_rows_match'; spins: number }
  // Lock chosen cells across spins
  | { kind: 'reel_lock_cells';        cells: number; spins: number }
  // Guarantee a minimum drop of a combat-token resource
  | { kind: 'reel_guarantee_drop';    resource: 'fuel' | 'boost' | 'shield' | 'any_combat'; min: number; spins: number }
  // +N of every combat token on the next N spins
  | { kind: 'reel_quartermaster';     perToken: number; spins: number }
  // Stardust drop riding on a big credit win
  | { kind: 'reel_stardust_on_big_win'; creditThreshold: number; stardust: number }
  // Rift: refund a percentage of the next N rift spends
  | { kind: 'reel_rift_refund';       pct: number; spins: number }
  // Rift: next N spins use the current tier for free (no credit cost)
  | { kind: 'reel_rift_free';         spins: number }
  // Rift: treat current tier as +N higher
  | { kind: 'reel_rift_tier_boost';   delta: 1 | 2; spins: number }
  // Rift: +X% payout this spin if rift tier meets the gate
  | { kind: 'reel_rift_payout_gate';  minTier: 1 | 2 | 3; bonusPct: number }
  // Rift 3 only: payout multiplier in exchange for fuel
  | { kind: 'reel_void_tap';          payoutMultiplier: number; fuelCost: number }
  // Anomaly: amplify the active anomaly multiplier
  | { kind: 'reel_anomaly_amplify';   multiplier: number; spins: number }
  // Anomaly: lock the current anomaly's effect for N spins regardless of cycle
  | { kind: 'reel_anomaly_lock';      spins: number }
  // Anomaly: payout bonus that only applies during a named anomaly
  | { kind: 'reel_anomaly_gated_bonus'; anomalies: string[]; bonusPct: number; spins: number }
  // Compound: payout +X% per spin, resets on a losing spin
  | { kind: 'reel_compound';          perSpinPct: number; spins: number }
  // Streak: payout +X% per consecutive winning spin (resets on loss). Distinct
  // from compound because it requires *winning* spins, not just elapsed spins.
  | { kind: 'reel_streak_bonus';      perWinPct: number; cap: number }
  // Hot streak: next-N spins, boost weight on the player's last winning symbol
  | { kind: 'reel_hot_streak';        symbolBonusPct: number; spins: number }
  // Tier echo — every active payline pays +X% (encourages multiline outpost gating)
  | { kind: 'reel_tier_echo';         perLinePct: number };

// Raid effects — applied inside resolveCombat.
export type RaidEffect =
  | { kind: 'raid_power_delta';                delta: number }
  | { kind: 'raid_defender_power_delta';       delta: number }
  | { kind: 'raid_bust_to_power';              power: number }
  | { kind: 'raid_loot_multiplier';            multiplier: number }
  | { kind: 'raid_vault_ignore';               pct: number }
  | { kind: 'raid_tax_collector';              perVaultLevelPct: number }
  | { kind: 'raid_smash_grab';                 lootBonusPct: number; powerPenalty: number }
  | { kind: 'raid_token_refund_on_win';        tokens: number }
  | { kind: 'raid_token_refund_on_loss_pct';   pct: number }
  | { kind: 'raid_no_consume_on_bust' }
  | { kind: 'raid_no_consume_on_loss' }
  | { kind: 'raid_disable_turret_on_jackpot';  hours: number }
  | { kind: 'raid_sabotage_spins_on_win';      pct: number }
  | { kind: 'raid_smoke_screen';               hours: number }
  | { kind: 'raid_pursuit_beacon';             minutes: number; lootBonusPct: number }
  | { kind: 'raid_extra_token_cost';           extraTokens: number; powerBonus: number }
  | { kind: 'raid_no_consume_on_token_bonus';  } // companion to extra_token_cost
  | { kind: 'raid_mini_game_rerolls';          extraSpins: number }
  | { kind: 'raid_drone_disrupt';              scope: 'raider_only' | 'all' }
  | { kind: 'raid_anomaly_shift';              mode: 'previous' | 'best' }
  | { kind: 'raid_power_per_turret_charge';    perCharge: number }
  | { kind: 'raid_ignore_turret_charges';      count: number }
  | { kind: 'raid_all_in';                     multiplier: number }
  | { kind: 'raid_wager';                      stake: number; payoutMultiplier: number }
  | { kind: 'raid_lucky_range';                range: [number, number]; lootBonusPct: number }
  | { kind: 'raid_loss_penalty_bonus';         extraPct: number } // attacker loses → defender gains extra
  | { kind: 'raid_vengeance_bonus';            powerBonus: number; windowMs: number }
  | { kind: 'raid_sector_specialist';          powerBonus: number; lootBonusPct: number }
  | { kind: 'raid_threat_index';               perLevel: number }
  | { kind: 'raid_cooldown_bypass';            lootPenaltyPct: number }
  | { kind: 'raid_reroll_mini_game';           takes: 'next' | 'best_of_2' }
  | { kind: 'raid_drone_synergy';              perDronePct: number }
  | { kind: 'raid_remove_wheel_slot';          count: number };

export type CardEffect = ReelEffect | RaidEffect;

// ── Card definition ──────────────────────────────────────────────────────

export interface CardDefinition {
  id: string;            // e.g. 'surge_core_minor' — globally unique
  baseId: string;        // 'surge_core' — shared between minor + major
  category: CardCategory;
  tier: CardTier;
  rarity: CardRarity;
  name: string;
  description: string;   // shown in inventory + drop modal
  flavor?: string;       // optional in-fiction one-liner
  synergies?: CardSynergy[];
  effects: CardEffect[]; // most cards have 1 effect; majors may have 2
}

// Player-facing inventory shape, persisted on users/{uid}.cards.
export type CardInventory = Record<string, number>;

// Active reel card pending the next spin. Server clears it after consumption
// inside the spin transaction (Phase B).
export type ActiveReelCard = string | null;

// ── Shred values (Phase D / inventory screen) ────────────────────────────

export const SHRED_VALUE_CR: Record<CardTier, number> = {
  MINOR: 100,
  MAJOR: 500,
};

// ── Drop tuning (Phase B drop roll) ──────────────────────────────────────

export const CARD_DROP_CHANCE = 0.015;     // ~1.5% per spin
export const CARD_TIER_MAJOR_CHANCE = 0.25; // 25% of drops are major
export const CARD_REEL_VS_RAID = 0.60;      // 60% reel / 40% raid
export const CARD_INVENTORY_CAP = 30;       // over cap → auto-shred to CR

// ── Catalog ──────────────────────────────────────────────────────────────

export const CARD_CATALOG: CardDefinition[] = [
  // ===========================================================================
  // RAID CARDS (30 baseIds × 2 tiers = 60 entries)
  // ===========================================================================

  // 1. Surge Core — flat power
  { id: 'surge_core_minor', baseId: 'surge_core', category: 'RAID', tier: 'MINOR', rarity: 'COMMON',
    name: 'Surge Core (Minor)', description: 'Next raid: +15 power.',
    effects: [{ kind: 'raid_power_delta', delta: 15 }] },
  { id: 'surge_core_major', baseId: 'surge_core', category: 'RAID', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Surge Core (Major)', description: 'Next raid: +30 power.',
    effects: [{ kind: 'raid_power_delta', delta: 30 }] },

  // 2. Skim Off — refund token on win in exchange for power penalty
  { id: 'skim_off_minor', baseId: 'skim_off', category: 'RAID', tier: 'MINOR', rarity: 'COMMON',
    name: 'Skim Off (Minor)', description: '-10 power; win refunds your token.',
    effects: [
      { kind: 'raid_power_delta', delta: -10 },
      { kind: 'raid_token_refund_on_win', tokens: 1 },
    ] },
  { id: 'skim_off_major', baseId: 'skim_off', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Skim Off (Major)', description: '-20 power; win refunds 2 tokens.',
    effects: [
      { kind: 'raid_power_delta', delta: -20 },
      { kind: 'raid_token_refund_on_win', tokens: 2 },
    ] },

  // 3. Wildfire — convert bust into base power
  { id: 'wildfire_minor', baseId: 'wildfire', category: 'RAID', tier: 'MINOR', rarity: 'COMMON',
    name: 'Wildfire (Minor)', description: 'Bust → 40 power.',
    effects: [{ kind: 'raid_bust_to_power', power: 40 }] },
  { id: 'wildfire_major', baseId: 'wildfire', category: 'RAID', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Wildfire (Major)', description: 'Bust → 80 power.',
    effects: [{ kind: 'raid_bust_to_power', power: 80 }] },

  // 4. Adrenal Spike — risky power bonus (per user: soften major to +75% loss)
  { id: 'adrenal_spike_minor', baseId: 'adrenal_spike', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Adrenal Spike (Minor)', description: '+25 power. On loss, defender steals +50% extra credits.',
    effects: [
      { kind: 'raid_power_delta', delta: 25 },
      { kind: 'raid_loss_penalty_bonus', extraPct: 0.5 },
    ] },
  { id: 'adrenal_spike_major', baseId: 'adrenal_spike', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Adrenal Spike (Major)', description: '+50 power. On loss, defender steals +75% extra credits.',
    effects: [
      { kind: 'raid_power_delta', delta: 50 },
      { kind: 'raid_loss_penalty_bonus', extraPct: 0.75 },
    ] },

  // 5. Stabilizer — remove low slots from the wheel
  { id: 'stabilizer_minor', baseId: 'stabilizer', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Stabilizer (Minor)', description: 'Remove the lowest wheel slot (no bust possible).',
    effects: [{ kind: 'raid_remove_wheel_slot', count: 1 }] },
  { id: 'stabilizer_major', baseId: 'stabilizer', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Stabilizer (Major)', description: 'Remove the 2 lowest wheel slots.',
    effects: [{ kind: 'raid_remove_wheel_slot', count: 2 }] },

  // 6. Power Drain — debuff defender power
  { id: 'power_drain_minor', baseId: 'power_drain', category: 'RAID', tier: 'MINOR', rarity: 'COMMON',
    name: 'Power Drain (Minor)', description: 'Defender power -10.',
    effects: [{ kind: 'raid_defender_power_delta', delta: -10 }] },
  { id: 'power_drain_major', baseId: 'power_drain', category: 'RAID', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Power Drain (Major)', description: 'Defender power -20.',
    effects: [{ kind: 'raid_defender_power_delta', delta: -20 }] },

  // 7. Vault Cracker — bypass VAULT reduction
  { id: 'vault_cracker_minor', baseId: 'vault_cracker', category: 'RAID', tier: 'MINOR', rarity: 'COMMON',
    name: 'Vault Cracker (Minor)', description: 'Ignore 25% of defender VAULT reduction.',
    effects: [{ kind: 'raid_vault_ignore', pct: 0.25 }] },
  { id: 'vault_cracker_major', baseId: 'vault_cracker', category: 'RAID', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Vault Cracker (Major)', description: 'Ignore 50% of defender VAULT reduction.',
    effects: [{ kind: 'raid_vault_ignore', pct: 0.5 }] },

  // 8. Smash & Grab — loot bump with power penalty
  { id: 'smash_grab_minor', baseId: 'smash_grab', category: 'RAID', tier: 'MINOR', rarity: 'COMMON',
    name: 'Smash & Grab (Minor)', description: '+15% loot.',
    effects: [{ kind: 'raid_smash_grab', lootBonusPct: 0.15, powerPenalty: 0 }] },
  { id: 'smash_grab_major', baseId: 'smash_grab', category: 'RAID', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Smash & Grab (Major)', description: '+35% loot, -5 power.',
    effects: [{ kind: 'raid_smash_grab', lootBonusPct: 0.35, powerPenalty: 5 }] },

  // 9. Tax Collector — scales with defender VAULT level
  { id: 'tax_collector_minor', baseId: 'tax_collector', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Tax Collector (Minor)', description: '+5% loot per defender VAULT level.',
    effects: [{ kind: 'raid_tax_collector', perVaultLevelPct: 0.05 }] },
  { id: 'tax_collector_major', baseId: 'tax_collector', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Tax Collector (Major)', description: '+10% loot per defender VAULT level.',
    effects: [{ kind: 'raid_tax_collector', perVaultLevelPct: 0.10 }] },

  // 10. Hostile Takeover — TURRET disable on JACKPOT (rebalanced to 4/6h)
  { id: 'hostile_takeover_minor', baseId: 'hostile_takeover', category: 'RAID', tier: 'MINOR', rarity: 'RARE',
    name: 'Hostile Takeover (Minor)', description: 'On JACKPOT power: disable defender TURRET for 4h.',
    effects: [{ kind: 'raid_disable_turret_on_jackpot', hours: 4 }] },
  { id: 'hostile_takeover_major', baseId: 'hostile_takeover', category: 'RAID', tier: 'MAJOR', rarity: 'EPIC',
    name: 'Hostile Takeover (Major)', description: 'On JACKPOT power: disable defender TURRET for 6h.',
    effects: [{ kind: 'raid_disable_turret_on_jackpot', hours: 6 }] },

  // 11. Sabotage — drain defender spin energy
  { id: 'sabotage_minor', baseId: 'sabotage', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Sabotage (Minor)', description: 'Defender loses 5% spin energy on your win.',
    effects: [{ kind: 'raid_sabotage_spins_on_win', pct: 0.05 }] },
  { id: 'sabotage_major', baseId: 'sabotage', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Sabotage (Major)', description: 'Defender loses 10% spin energy on your win.',
    effects: [{ kind: 'raid_sabotage_spins_on_win', pct: 0.10 }] },

  // 12. Smoke Screen — hide from combat log
  { id: 'smoke_screen_minor', baseId: 'smoke_screen', category: 'RAID', tier: 'MINOR', rarity: 'COMMON',
    name: 'Smoke Screen (Minor)', description: 'Hide this raid from defender combat log for 1h.',
    effects: [{ kind: 'raid_smoke_screen', hours: 1 }] },
  { id: 'smoke_screen_major', baseId: 'smoke_screen', category: 'RAID', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Smoke Screen (Major)', description: 'Hide this raid from defender combat log for 4h.',
    effects: [{ kind: 'raid_smoke_screen', hours: 4 }] },

  // 13. Mirror Shield — token refund on loss
  { id: 'mirror_shield_minor', baseId: 'mirror_shield', category: 'RAID', tier: 'MINOR', rarity: 'COMMON',
    name: 'Mirror Shield (Minor)', description: 'Refund half token cost on loss.',
    effects: [{ kind: 'raid_token_refund_on_loss_pct', pct: 0.5 }] },
  { id: 'mirror_shield_major', baseId: 'mirror_shield', category: 'RAID', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Mirror Shield (Major)', description: 'Full token refund on loss.',
    effects: [{ kind: 'raid_token_refund_on_loss_pct', pct: 1.0 }] },

  // 14. Pursuit Beacon — bonus loot on re-raid
  { id: 'pursuit_beacon_minor', baseId: 'pursuit_beacon', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Pursuit Beacon (Minor)', description: '+20% loot on re-raid of this target within 30 min.',
    effects: [{ kind: 'raid_pursuit_beacon', minutes: 30, lootBonusPct: 0.20 }] },
  { id: 'pursuit_beacon_major', baseId: 'pursuit_beacon', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Pursuit Beacon (Major)', description: '+20% loot on re-raid of this target within 60 min.',
    effects: [{ kind: 'raid_pursuit_beacon', minutes: 60, lootBonusPct: 0.20 }] },

  // 15. Twin Strike — extra token cost, power bonus
  { id: 'twin_strike_minor', baseId: 'twin_strike', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Twin Strike (Minor)', description: 'Costs 1 extra token; +15 power.',
    effects: [{ kind: 'raid_extra_token_cost', extraTokens: 1, powerBonus: 15 }] },
  { id: 'twin_strike_major', baseId: 'twin_strike', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Twin Strike (Major)', description: 'Costs 2 extra tokens; +35 power.',
    effects: [{ kind: 'raid_extra_token_cost', extraTokens: 2, powerBonus: 35 }] },

  // 16. Phantom Strike — don't consume token on bust/loss
  { id: 'phantom_strike_minor', baseId: 'phantom_strike', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Phantom Strike (Minor)', description: "Don't consume your token on a bust.",
    effects: [{ kind: 'raid_no_consume_on_bust' }] },
  { id: 'phantom_strike_major', baseId: 'phantom_strike', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Phantom Strike (Major)', description: "Don't consume your token on any loss.",
    effects: [{ kind: 'raid_no_consume_on_loss' }] },

  // 17. Triple Threat — mini-game rerolls (capped per user feedback)
  { id: 'triple_threat_minor', baseId: 'triple_threat', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Triple Threat (Minor)', description: 'Roulette spins twice, take the higher.',
    effects: [{ kind: 'raid_mini_game_rerolls', extraSpins: 1 }] },
  { id: 'triple_threat_major', baseId: 'triple_threat', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Triple Threat (Major)', description: 'Roulette spins 3×, take the highest.',
    effects: [{ kind: 'raid_mini_game_rerolls', extraSpins: 2 }] },

  // 18. Drone Disruptor — kill defender drones
  { id: 'drone_disruptor_minor', baseId: 'drone_disruptor', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Drone Disruptor (Minor)', description: "Defender's RAIDER drone disabled for this raid.",
    effects: [{ kind: 'raid_drone_disrupt', scope: 'raider_only' }] },
  { id: 'drone_disruptor_major', baseId: 'drone_disruptor', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Drone Disruptor (Major)', description: 'All defender drones disabled for this raid.',
    effects: [{ kind: 'raid_drone_disrupt', scope: 'all' }] },

  // 19. Anomaly Shift — pick a better anomaly
  { id: 'anomaly_shift_minor', baseId: 'anomaly_shift', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Anomaly Shift (Minor)', description: 'Use the previous anomaly bonus if higher.', synergies: ['ANOMALY'],
    effects: [{ kind: 'raid_anomaly_shift', mode: 'previous' }] },
  { id: 'anomaly_shift_major', baseId: 'anomaly_shift', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Anomaly Shift (Major)', description: 'Use the highest available anomaly bonus.', synergies: ['ANOMALY'],
    effects: [{ kind: 'raid_anomaly_shift', mode: 'best' }] },

  // 20. Power Sponge — counter TURRET charges
  { id: 'power_sponge_minor', baseId: 'power_sponge', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Power Sponge (Minor)', description: '+5 power per TURRET charge defender uses.',
    effects: [{ kind: 'raid_power_per_turret_charge', perCharge: 5 }] },
  { id: 'power_sponge_major', baseId: 'power_sponge', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Power Sponge (Major)', description: '+10 power per TURRET charge defender uses.',
    effects: [{ kind: 'raid_power_per_turret_charge', perCharge: 10 }] },

  // 21. Cloak Jammer — skip TURRET charges entirely
  { id: 'cloak_jammer_minor', baseId: 'cloak_jammer', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Cloak Jammer (Minor)', description: 'Ignore 1 TURRET charge this raid.',
    effects: [{ kind: 'raid_ignore_turret_charges', count: 1 }] },
  { id: 'cloak_jammer_major', baseId: 'cloak_jammer', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Cloak Jammer (Major)', description: 'Ignore 2 TURRET charges this raid.',
    effects: [{ kind: 'raid_ignore_turret_charges', count: 2 }] },

  // 22. All In — multiply both sides of the bet
  { id: 'all_in_minor', baseId: 'all_in', category: 'RAID', tier: 'MINOR', rarity: 'RARE',
    name: 'All In (Minor)', description: '2× loot on win, 2× token cost on loss.',
    effects: [{ kind: 'raid_all_in', multiplier: 2 }] },
  { id: 'all_in_major', baseId: 'all_in', category: 'RAID', tier: 'MAJOR', rarity: 'EPIC',
    name: 'All In (Major)', description: '3× loot on win, 3× token cost on loss.',
    effects: [{ kind: 'raid_all_in', multiplier: 3 }] },

  // 23. Wager — credit stake side-bet
  { id: 'wager_minor', baseId: 'wager', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Wager (Minor)', description: 'Stake 500 CR; +1.5× on win, lose 500 CR on loss.',
    effects: [{ kind: 'raid_wager', stake: 500, payoutMultiplier: 1.5 }] },
  { id: 'wager_major', baseId: 'wager', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Wager (Major)', description: 'Stake 2,000 CR; +2× on win, lose 2,000 CR on loss.',
    effects: [{ kind: 'raid_wager', stake: 2000, payoutMultiplier: 2 }] },

  // 24. Lucky Seven — bonus on landing in a power range
  { id: 'lucky_seven_minor', baseId: 'lucky_seven', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Lucky Seven (Minor)', description: 'Power in 70-79 range → +50% loot.',
    effects: [{ kind: 'raid_lucky_range', range: [70, 79], lootBonusPct: 0.5 }] },
  { id: 'lucky_seven_major', baseId: 'lucky_seven', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Lucky Seven (Major)', description: 'Power in 60-89 range → +100% loot.',
    effects: [{ kind: 'raid_lucky_range', range: [60, 89], lootBonusPct: 1.0 }] },

  // 25. Vengeance Cast — retaliation bonus
  { id: 'vengeance_cast_minor', baseId: 'vengeance_cast', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Vengeance Cast (Minor)', description: '+20 power when raiding someone who hit you in the last 24h.',
    effects: [{ kind: 'raid_vengeance_bonus', powerBonus: 20, windowMs: 24 * 3_600_000 }] },
  { id: 'vengeance_cast_major', baseId: 'vengeance_cast', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Vengeance Cast (Major)', description: '+40 power when raiding someone who hit you in the last 24h.',
    effects: [{ kind: 'raid_vengeance_bonus', powerBonus: 40, windowMs: 24 * 3_600_000 }] },

  // 26. Sector Specialist — bonus in current sector
  { id: 'sector_specialist_minor', baseId: 'sector_specialist', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Sector Specialist (Minor)', description: '+15 power when raiding within your current sector.', synergies: ['SECTOR'],
    effects: [{ kind: 'raid_sector_specialist', powerBonus: 15, lootBonusPct: 0 }] },
  { id: 'sector_specialist_major', baseId: 'sector_specialist', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Sector Specialist (Major)', description: '+30 power and +20% loot in your current sector.', synergies: ['SECTOR'],
    effects: [{ kind: 'raid_sector_specialist', powerBonus: 30, lootBonusPct: 0.20 }] },

  // 27. Threat Index — bonus per OP-level gap
  { id: 'threat_index_minor', baseId: 'threat_index', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Threat Index (Minor)', description: '+10 power per OP level defender exceeds you.',
    effects: [{ kind: 'raid_threat_index', perLevel: 10 }] },
  { id: 'threat_index_major', baseId: 'threat_index', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Threat Index (Major)', description: '+20 power per OP level defender exceeds you.',
    effects: [{ kind: 'raid_threat_index', perLevel: 20 }] },

  // 28. Cooldown Cracker — skip the 10-min attack cooldown
  { id: 'cooldown_cracker_minor', baseId: 'cooldown_cracker', category: 'RAID', tier: 'MINOR', rarity: 'RARE',
    name: 'Cooldown Cracker (Minor)', description: 'Bypass defender attack cooldown; -25% loot.',
    effects: [{ kind: 'raid_cooldown_bypass', lootPenaltyPct: 0.25 }] },
  { id: 'cooldown_cracker_major', baseId: 'cooldown_cracker', category: 'RAID', tier: 'MAJOR', rarity: 'EPIC',
    name: 'Cooldown Cracker (Major)', description: 'Bypass defender attack cooldown with no penalty.',
    effects: [{ kind: 'raid_cooldown_bypass', lootPenaltyPct: 0 }] },

  // 29. Reroll Module — redraw the mini-game
  { id: 'reroll_module_minor', baseId: 'reroll_module', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Reroll Module (Minor)', description: 'Discard mini-game result and draw again.',
    effects: [{ kind: 'raid_reroll_mini_game', takes: 'next' }] },
  { id: 'reroll_module_major', baseId: 'reroll_module', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Reroll Module (Major)', description: 'Discard mini-game result, draw twice, take the higher.',
    effects: [{ kind: 'raid_reroll_mini_game', takes: 'best_of_2' }] },

  // 30. Synergy Link — drone-loadout bonus
  { id: 'synergy_link_minor', baseId: 'synergy_link', category: 'RAID', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Synergy Link (Minor)', description: '+10% loot per active drone you own.', synergies: ['DRONE'],
    effects: [{ kind: 'raid_drone_synergy', perDronePct: 0.10 }] },
  { id: 'synergy_link_major', baseId: 'synergy_link', category: 'RAID', tier: 'MAJOR', rarity: 'RARE',
    name: 'Synergy Link (Major)', description: '+20% loot per active drone you own.', synergies: ['DRONE'],
    effects: [{ kind: 'raid_drone_synergy', perDronePct: 0.20 }] },

  // ===========================================================================
  // REEL CARDS
  // ===========================================================================

  // 1. Lodestone — credit symbol weight
  { id: 'lodestone_minor', baseId: 'lodestone', category: 'REEL', tier: 'MINOR', rarity: 'COMMON',
    name: 'Lodestone (Minor)', description: 'Next spin: +20% credit symbol weight.',
    effects: [{ kind: 'reel_weight_multiplier', symbols: ['CREDIT_SMALL', 'CREDIT_MEDIUM', 'CREDIT_LARGE'], multiplier: 1.2, spins: 1 }] },
  { id: 'lodestone_major', baseId: 'lodestone', category: 'REEL', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Lodestone (Major)', description: 'Next spin: +50% credit symbol weight.',
    effects: [{ kind: 'reel_weight_multiplier', symbols: ['CREDIT_SMALL', 'CREDIT_MEDIUM', 'CREDIT_LARGE'], multiplier: 1.5, spins: 1 }] },

  // 2. Hot Streak — bias toward your last winning symbol
  { id: 'hot_streak_minor', baseId: 'hot_streak', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Hot Streak (Minor)', description: 'Next 3 spins: +10% weight on your last winning symbol.',
    effects: [{ kind: 'reel_hot_streak', symbolBonusPct: 0.10, spins: 3 }] },
  { id: 'hot_streak_major', baseId: 'hot_streak', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Hot Streak (Major)', description: 'Next 5 spins: +25% weight on your last winning symbol.',
    effects: [{ kind: 'reel_hot_streak', symbolBonusPct: 0.25, spins: 5 }] },

  // 3. Coil Tap — combat-token symbol bias
  { id: 'coil_tap_minor', baseId: 'coil_tap', category: 'REEL', tier: 'MINOR', rarity: 'COMMON',
    name: 'Coil Tap (Minor)', description: 'Next spin: ATTACK and RAID weights ×2.',
    effects: [{ kind: 'reel_weight_multiplier', symbols: ['ATTACK', 'RAID'], multiplier: 2, spins: 1 }] },
  { id: 'coil_tap_major', baseId: 'coil_tap', category: 'REEL', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Coil Tap (Major)', description: 'Next spin: ATTACK and RAID weights ×3.',
    effects: [{ kind: 'reel_weight_multiplier', symbols: ['ATTACK', 'RAID'], multiplier: 3, spins: 1 }] },

  // 4. Cleansing Surge — fight the EMPTY symbol
  { id: 'cleansing_surge_minor', baseId: 'cleansing_surge', category: 'REEL', tier: 'MINOR', rarity: 'COMMON',
    name: 'Cleansing Surge (Minor)', description: 'Next spin: EMPTY weight halved.',
    effects: [{ kind: 'reel_empty_reduction', ratio: 0.5, spins: 1 }] },
  { id: 'cleansing_surge_major', baseId: 'cleansing_surge', category: 'REEL', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Cleansing Surge (Major)', description: 'Next spin: EMPTY weight set to 0.',
    effects: [{ kind: 'reel_empty_reduction', ratio: 0, spins: 1 }] },

  // 5. Symbol Saturation — small-win consolidation
  { id: 'symbol_saturation_minor', baseId: 'symbol_saturation', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Symbol Saturation (Minor)', description: 'Next spin: CREDIT_LARGE rolls convert to CREDIT_MEDIUM.',
    effects: [{ kind: 'reel_symbol_convert', from: 'CREDIT_LARGE', to: 'CREDIT_MEDIUM', spins: 1 }] },
  { id: 'symbol_saturation_major', baseId: 'symbol_saturation', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Symbol Saturation (Major)', description: 'Next spin: CREDIT_SMALL rolls convert to CREDIT_MEDIUM.',
    effects: [{ kind: 'reel_symbol_convert', from: 'CREDIT_SMALL', to: 'CREDIT_MEDIUM', spins: 1 }] },

  // 6. Reel Lock — pin cells across a spin
  { id: 'reel_lock_minor', baseId: 'reel_lock', category: 'REEL', tier: 'MINOR', rarity: 'RARE',
    name: 'Reel Lock (Minor)', description: 'Lock 1 chosen cell for the next spin.',
    effects: [{ kind: 'reel_lock_cells', cells: 1, spins: 1 }] },
  { id: 'reel_lock_major', baseId: 'reel_lock', category: 'REEL', tier: 'MAJOR', rarity: 'EPIC',
    name: 'Reel Lock (Major)', description: 'Lock 2 chosen cells for the next spin.',
    effects: [{ kind: 'reel_lock_cells', cells: 2, spins: 1 }] },

  // 7. Echo Spin — chance of free re-spin on win
  { id: 'echo_spin_minor', baseId: 'echo_spin', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Echo Spin (Minor)', description: 'Next spin: 25% chance of one free re-spin on win.',
    effects: [{ kind: 'reel_echo_chance', chance: 0.25, maxExtra: 1 }] },
  { id: 'echo_spin_major', baseId: 'echo_spin', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Echo Spin (Major)', description: 'Next spin: 50% chance of free re-spins (up to 2).',
    effects: [{ kind: 'reel_echo_chance', chance: 0.50, maxExtra: 2 }] },

  // 8. Cascade — winning cells refill
  { id: 'cascade_minor', baseId: 'cascade', category: 'REEL', tier: 'MINOR', rarity: 'RARE',
    name: 'Cascade (Minor)', description: 'Winning cells refill and re-evaluate once.',
    effects: [{ kind: 'reel_cascade', maxChain: 1 }] },
  { id: 'cascade_major', baseId: 'cascade', category: 'REEL', tier: 'MAJOR', rarity: 'EPIC',
    name: 'Cascade (Major)', description: 'Winning cells cascade until no further wins.',
    effects: [{ kind: 'reel_cascade', maxChain: 10 }] },

  // 9. Mirror Reel — force layout
  { id: 'mirror_reel_minor', baseId: 'mirror_reel', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Mirror Reel (Minor)', description: 'Next spin: leftmost and rightmost reels match.',
    effects: [{ kind: 'reel_layout_force', mode: 'mirror_left_right', spins: 1 }] },
  { id: 'mirror_reel_major', baseId: 'mirror_reel', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Mirror Reel (Major)', description: 'Next spin: all 3 cells in MID row match.',
    effects: [{ kind: 'reel_layout_force', mode: 'mid_row_match', spins: 1 }] },

  // 10. Symmetry Field — multi-row force
  { id: 'symmetry_field_minor', baseId: 'symmetry_field', category: 'REEL', tier: 'MINOR', rarity: 'RARE',
    name: 'Symmetry Field (Minor)', description: 'Next spin: TOP and BOT rows mirror each other.',
    effects: [{ kind: 'reel_layout_force', mode: 'top_bot_mirror', spins: 1 }] },
  { id: 'symmetry_field_major', baseId: 'symmetry_field', category: 'REEL', tier: 'MAJOR', rarity: 'EPIC',
    name: 'Symmetry Field (Major)', description: 'Next spin: all 3 rows identical.',
    effects: [{ kind: 'reel_layout_force', mode: 'all_rows_match', spins: 1 }] },

  // 11. Static Multiplier — flat payout bump
  { id: 'static_multiplier_minor', baseId: 'static_multiplier', category: 'REEL', tier: 'MINOR', rarity: 'COMMON',
    name: 'Static Multiplier (Minor)', description: 'Next spin payout ×1.5.',
    effects: [{ kind: 'reel_payout_multiplier', multiplier: 1.5, spins: 1 }] },
  { id: 'static_multiplier_major', baseId: 'static_multiplier', category: 'REEL', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Static Multiplier (Major)', description: 'Next spin payout ×2.5.',
    effects: [{ kind: 'reel_payout_multiplier', multiplier: 2.5, spins: 1 }] },

  // 12. Compound Interest — escalating multi-spin bonus
  { id: 'compound_interest_minor', baseId: 'compound_interest', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Compound Interest (Minor)', description: 'Next 5 spins: +5% payout per spin (resets on losing spin).',
    effects: [{ kind: 'reel_compound', perSpinPct: 0.05, spins: 5 }] },
  { id: 'compound_interest_major', baseId: 'compound_interest', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Compound Interest (Major)', description: 'Next 5 spins: +10% payout per spin (resets on losing spin).',
    effects: [{ kind: 'reel_compound', perSpinPct: 0.10, spins: 5 }] },

  // 13. Jackpot Magnet — JP-only multiplier
  { id: 'jackpot_magnet_minor', baseId: 'jackpot_magnet', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Jackpot Magnet (Minor)', description: 'Next 3 spins: JACKPOT payouts ×1.5.',
    effects: [{ kind: 'reel_jackpot_multiplier', multiplier: 1.5, spins: 3 }] },
  { id: 'jackpot_magnet_major', baseId: 'jackpot_magnet', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Jackpot Magnet (Major)', description: 'Next 3 spins: JACKPOT payouts ×3.',
    effects: [{ kind: 'reel_jackpot_multiplier', multiplier: 3, spins: 3 }] },

  // 14. Tier Echo — multiline bonus
  { id: 'tier_echo_minor', baseId: 'tier_echo', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Tier Echo (Minor)', description: '+5% credit yield per active payline this spin.',
    effects: [{ kind: 'reel_tier_echo', perLinePct: 0.05 }] },
  { id: 'tier_echo_major', baseId: 'tier_echo', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Tier Echo (Major)', description: '+10% credit yield per active payline this spin.',
    effects: [{ kind: 'reel_tier_echo', perLinePct: 0.10 }] },

  // 15. Fortuneflux — guaranteed combat-token drop
  { id: 'fortuneflux_minor', baseId: 'fortuneflux', category: 'REEL', tier: 'MINOR', rarity: 'COMMON',
    name: 'Fortuneflux (Minor)', description: 'Next spin: guaranteed ≥1 fuel/boost/shield.',
    effects: [{ kind: 'reel_guarantee_drop', resource: 'any_combat', min: 1, spins: 1 }] },
  { id: 'fortuneflux_major', baseId: 'fortuneflux', category: 'REEL', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Fortuneflux (Major)', description: 'Next spin: guaranteed ≥3 of any combat token.',
    effects: [{ kind: 'reel_guarantee_drop', resource: 'any_combat', min: 3, spins: 1 }] },

  // 16. Quartermaster — bulk combat tokens
  { id: 'quartermaster_minor', baseId: 'quartermaster', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Quartermaster (Minor)', description: 'Next spin: +2 of every combat token.',
    effects: [{ kind: 'reel_quartermaster', perToken: 2, spins: 1 }] },
  { id: 'quartermaster_major', baseId: 'quartermaster', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Quartermaster (Major)', description: 'Next spin: +5 of every combat token.',
    effects: [{ kind: 'reel_quartermaster', perToken: 5, spins: 1 }] },

  // 17. Stardust Whisper — premium currency on big wins
  { id: 'stardust_whisper_minor', baseId: 'stardust_whisper', category: 'REEL', tier: 'MINOR', rarity: 'RARE',
    name: 'Stardust Whisper (Minor)', description: 'If next spin wins ≥1000 CR, also drop 1 ✦.',
    effects: [{ kind: 'reel_stardust_on_big_win', creditThreshold: 1000, stardust: 1 }] },
  { id: 'stardust_whisper_major', baseId: 'stardust_whisper', category: 'REEL', tier: 'MAJOR', rarity: 'EPIC',
    name: 'Stardust Whisper (Major)', description: 'If next spin wins ≥1000 CR, also drop 3 ✦.',
    effects: [{ kind: 'reel_stardust_on_big_win', creditThreshold: 1000, stardust: 3 }] },

  // 18. Static Charge — partial Rift refund (Rift synergy)
  { id: 'static_charge_minor', baseId: 'static_charge', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Static Charge (Minor)', description: 'Next 3 Rift spins: 50% cost refund.', synergies: ['RIFT_ANY'],
    effects: [{ kind: 'reel_rift_refund', pct: 0.5, spins: 3 }] },
  { id: 'static_charge_major', baseId: 'static_charge', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Static Charge (Major)', description: 'Next 5 Rift spins: 100% cost refund.', synergies: ['RIFT_ANY'],
    effects: [{ kind: 'reel_rift_refund', pct: 1.0, spins: 5 }] },

  // 19. Tier Lock — free Rift for N spins (Rift synergy)
  { id: 'tier_lock_minor', baseId: 'tier_lock', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Tier Lock (Minor)', description: 'Next 2 spins use your current Rift tier for free.', synergies: ['RIFT_ANY'],
    effects: [{ kind: 'reel_rift_free', spins: 2 }] },
  { id: 'tier_lock_major', baseId: 'tier_lock', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Tier Lock (Major)', description: 'Next 5 spins use your current Rift tier for free.', synergies: ['RIFT_ANY'],
    effects: [{ kind: 'reel_rift_free', spins: 5 }] },

  // 20. Rift Echo — payout bonus gated on rift tier (Rift synergy)
  { id: 'rift_echo_minor', baseId: 'rift_echo', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Rift Echo (Minor)', description: 'If Rift ≥ 1 on next spin: payout +20%.', synergies: ['RIFT_ANY'],
    effects: [{ kind: 'reel_rift_payout_gate', minTier: 1, bonusPct: 0.20 }] },
  { id: 'rift_echo_major', baseId: 'rift_echo', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Rift Echo (Major)', description: 'If Rift ≥ 2 on next spin: payout +40%.', synergies: ['RIFT_ANY'],
    effects: [{ kind: 'reel_rift_payout_gate', minTier: 2, bonusPct: 0.40 }] },

  // 21. Tier Surge — temporary rift escalation (Rift synergy)
  { id: 'tier_surge_minor', baseId: 'tier_surge', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Tier Surge (Minor)', description: 'Next spin treats your Rift as +1 tier higher.', synergies: ['RIFT_ANY'],
    effects: [{ kind: 'reel_rift_tier_boost', delta: 1, spins: 1 }] },
  { id: 'tier_surge_major', baseId: 'tier_surge', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Tier Surge (Major)', description: 'Next spin treats your Rift as +2 tiers higher.', synergies: ['RIFT_ANY'],
    effects: [{ kind: 'reel_rift_tier_boost', delta: 2, spins: 1 }] },

  // 22. Void Tap — Rift 3 only payout multiplier
  { id: 'void_tap_minor', baseId: 'void_tap', category: 'REEL', tier: 'MINOR', rarity: 'RARE',
    name: 'Void Tap (Minor)', description: 'Rift 3 only: next spin ×2 payout, consumes 1 fuel.', synergies: ['RIFT_3'],
    effects: [{ kind: 'reel_void_tap', payoutMultiplier: 2, fuelCost: 1 }] },
  { id: 'void_tap_major', baseId: 'void_tap', category: 'REEL', tier: 'MAJOR', rarity: 'EPIC',
    name: 'Void Tap (Major)', description: 'Rift 3 only: next spin ×3 payout, consumes 3 fuel.', synergies: ['RIFT_3'],
    effects: [{ kind: 'reel_void_tap', payoutMultiplier: 3, fuelCost: 3 }] },

  // 23. Diagonal Boost — line-specific multiplier
  { id: 'diagonal_boost_minor', baseId: 'diagonal_boost', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Diagonal Boost (Minor)', description: 'Next spin: DIAG_DOWN / DIAG_UP payouts ×2.',
    effects: [{ kind: 'reel_line_multiplier', lines: ['DIAG_DOWN', 'DIAG_UP'], multiplier: 2, spins: 1 }] },
  { id: 'diagonal_boost_major', baseId: 'diagonal_boost', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Diagonal Boost (Major)', description: 'Next spin: DIAG_DOWN / DIAG_UP payouts ×3.',
    effects: [{ kind: 'reel_line_multiplier', lines: ['DIAG_DOWN', 'DIAG_UP'], multiplier: 3, spins: 1 }] },

  // 24. Center Lock — MID-line multiplier
  { id: 'center_lock_minor', baseId: 'center_lock', category: 'REEL', tier: 'MINOR', rarity: 'COMMON',
    name: 'Center Lock (Minor)', description: 'Next spin: MID line payout ×2.',
    effects: [{ kind: 'reel_line_multiplier', lines: ['MID'], multiplier: 2, spins: 1 }] },
  { id: 'center_lock_major', baseId: 'center_lock', category: 'REEL', tier: 'MAJOR', rarity: 'UNCOMMON',
    name: 'Center Lock (Major)', description: 'Next spin: MID line payout ×4.',
    effects: [{ kind: 'reel_line_multiplier', lines: ['MID'], multiplier: 4, spins: 1 }] },

  // 25. Edge Surge — TOP/BOT line multiplier
  { id: 'edge_surge_minor', baseId: 'edge_surge', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Edge Surge (Minor)', description: 'Next spin: TOP and BOT lines payout ×1.5.',
    effects: [{ kind: 'reel_line_multiplier', lines: ['TOP', 'BOT'], multiplier: 1.5, spins: 1 }] },
  { id: 'edge_surge_major', baseId: 'edge_surge', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Edge Surge (Major)', description: 'Next spin: TOP and BOT lines payout ×3.',
    effects: [{ kind: 'reel_line_multiplier', lines: ['TOP', 'BOT'], multiplier: 3, spins: 1 }] },

  // 26. Extra Lines — bonus paylines
  { id: 'extra_lines_minor', baseId: 'extra_lines', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Extra Lines (Minor)', description: 'Next spin: +1 active payline.',
    effects: [{ kind: 'reel_extra_lines', count: 1, spins: 1 }] },
  { id: 'extra_lines_major', baseId: 'extra_lines', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Extra Lines (Major)', description: 'Next spin: +2 active paylines.',
    effects: [{ kind: 'reel_extra_lines', count: 2, spins: 1 }] },

  // 27. Storm Chaser — anomaly-gated payout
  { id: 'storm_chaser_minor', baseId: 'storm_chaser', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Storm Chaser (Minor)', description: 'During VOID_STORM/CREDIT_BLOOM: next spin payout +30%.', synergies: ['ANOMALY'],
    effects: [{ kind: 'reel_anomaly_gated_bonus', anomalies: ['VOID_STORM', 'CREDIT_BLOOM'], bonusPct: 0.30, spins: 1 }] },
  { id: 'storm_chaser_major', baseId: 'storm_chaser', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Storm Chaser (Major)', description: 'During any anomaly: next spin payout +60%.', synergies: ['ANOMALY'],
    effects: [{ kind: 'reel_anomaly_gated_bonus', anomalies: ['SOLAR_SURGE', 'VOID_STORM', 'CREDIT_BLOOM', 'SHIELD_PULSE', 'RAID_SHADOW'], bonusPct: 0.60, spins: 1 }] },

  // 28. Solar Sink — Solar Surge anomaly amplification
  { id: 'solar_sink_minor', baseId: 'solar_sink', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Solar Sink (Minor)', description: 'During SOLAR_SURGE: next 3 spins double anomaly multiplier.', synergies: ['ANOMALY'],
    effects: [{ kind: 'reel_anomaly_amplify', multiplier: 2, spins: 3 }] },
  { id: 'solar_sink_major', baseId: 'solar_sink', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Solar Sink (Major)', description: 'During SOLAR_SURGE: next 5 spins double anomaly multiplier.', synergies: ['ANOMALY'],
    effects: [{ kind: 'reel_anomaly_amplify', multiplier: 2, spins: 5 }] },

  // 29. Anomaly Anchor — lock anomaly past its cycle
  { id: 'anomaly_anchor_minor', baseId: 'anomaly_anchor', category: 'REEL', tier: 'MINOR', rarity: 'RARE',
    name: 'Anomaly Anchor (Minor)', description: 'Lock the current anomaly effect to your next 5 spins.', synergies: ['ANOMALY'],
    effects: [{ kind: 'reel_anomaly_lock', spins: 5 }] },
  { id: 'anomaly_anchor_major', baseId: 'anomaly_anchor', category: 'REEL', tier: 'MAJOR', rarity: 'EPIC',
    name: 'Anomaly Anchor (Major)', description: 'Lock the current anomaly effect to your next 10 spins.', synergies: ['ANOMALY'],
    effects: [{ kind: 'reel_anomaly_lock', spins: 10 }] },

  // 30. Streak Catalyst — escalating bonus per consecutive win
  { id: 'streak_catalyst_minor', baseId: 'streak_catalyst', category: 'REEL', tier: 'MINOR', rarity: 'UNCOMMON',
    name: 'Streak Catalyst (Minor)', description: 'Each consecutive winning spin adds +5% payout to the next (caps at +50%).',
    effects: [{ kind: 'reel_streak_bonus', perWinPct: 0.05, cap: 0.5 }] },
  { id: 'streak_catalyst_major', baseId: 'streak_catalyst', category: 'REEL', tier: 'MAJOR', rarity: 'RARE',
    name: 'Streak Catalyst (Major)', description: 'Each consecutive winning spin adds +10% payout to the next (caps at +100%).',
    effects: [{ kind: 'reel_streak_bonus', perWinPct: 0.10, cap: 1.0 }] },
];

// ── Lookup helpers ───────────────────────────────────────────────────────

const CATALOG_BY_ID: Record<string, CardDefinition> = CARD_CATALOG.reduce(
  (acc, card) => { acc[card.id] = card; return acc; },
  {} as Record<string, CardDefinition>,
);

export function getCardDefinition(id: string): CardDefinition | undefined {
  return CATALOG_BY_ID[id];
}

export function getCardsByCategory(category: CardCategory): CardDefinition[] {
  return CARD_CATALOG.filter((c) => c.category === category);
}

export function getCardsByRarity(rarity: CardRarity): CardDefinition[] {
  return CARD_CATALOG.filter((c) => c.rarity === rarity);
}
