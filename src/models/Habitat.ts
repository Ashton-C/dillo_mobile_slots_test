import { z } from 'zod';
import { Timestamp } from 'firebase/firestore';

// Firestore collection: "habitats"
// Document ID: auto-generated; referenced from User.habitatId

export const BuildingType = z.enum([
  'GENERATOR',    // produces passive credits
  'ARMORY',       // increases max attacks stored
  'VAULT',        // reduces credit loss on raid
  'TURRET',       // auto-defends against 1 attack per day
  'HANGAR',       // drone bay — unlocks Mercenary Contracts (Phase 2)
  'BARRACKS',     // increases max spin storage cap
]);
export type BuildingType = z.infer<typeof BuildingType>;

// Hard ceiling on building and outpost level. Above LEVEL_SOFT_CAP (10), the
// game enters "prestige" territory: cost still scales geometrically, build
// times saturate, and each level grants a credit-yield bonus instead of
// unlocking new content (no new grid sizes, paylines, etc.).
export const LEVEL_SOFT_CAP = 10;
export const LEVEL_HARD_CAP = 50;

export const BuildingSchema = z.object({
  type: BuildingType,
  level: z.number().int().min(1).max(LEVEL_HARD_CAP).default(1),
  builtAt: z.instanceof(Timestamp),
});
export type Building = z.infer<typeof BuildingSchema>;

// Upgrade cost (credits) for each building level. Curve: base × 1.9^(level-1).
// True geometric growth means level 10 ≈ 233× base and the full max-out grind
// is ~2M CR at outpost 6 EV (~67 days from spins alone). Prevents the old
// `level^1.4` shallow curve where a daily player maxed out in <2 weeks.
const BUILDING_BASE_COST: Record<BuildingType, number> = {
  GENERATOR: 400,
  ARMORY:    250,
  VAULT:     350,
  TURRET:    500,
  HANGAR:    1000,
  BARRACKS:  250,
};

const COST_GROWTH = 1.9;

function scaleCost(base: number, level: number): number {
  return Math.round(base * Math.pow(COST_GROWTH, level - 1));
}

export const BUILDING_UPGRADE_COST: Record<BuildingType, (level: number) => number> = {
  GENERATOR: (lvl) => scaleCost(BUILDING_BASE_COST.GENERATOR, lvl),
  ARMORY:    (lvl) => scaleCost(BUILDING_BASE_COST.ARMORY,    lvl),
  VAULT:     (lvl) => scaleCost(BUILDING_BASE_COST.VAULT,     lvl),
  TURRET:    (lvl) => scaleCost(BUILDING_BASE_COST.TURRET,    lvl),
  HANGAR:    (lvl) => scaleCost(BUILDING_BASE_COST.HANGAR,    lvl),
  BARRACKS:  (lvl) => scaleCost(BUILDING_BASE_COST.BARRACKS,  lvl),
};

// Base 25 spins; Barracks adds an escalating bonus per level (+5, +6, +7…).
// Lvl 0 → 25, lvl 1 → 30, lvl 5 → 60, lvl 10 → 120.
export function getMaxSpins(barracksLevel: number): number {
  return 25 + barracksLevel * 5 + (barracksLevel * (barracksLevel - 1)) / 2;
}

// Build duration (ms) to upgrade TO the given level. Levels 1–10 have hand-tuned
// timers; levels 11+ saturate at the level-10 duration (72h) so prestige levels
// don't become unplayable.
const BUILD_DURATION_TABLE: { [targetLevel: number]: number } = {
  1: 0,
  2: 30_000,
  3: 5 * 60_000,
  4: 15 * 60_000,
  5: 60 * 60_000,
  6: 4 * 3_600_000,
  7: 12 * 3_600_000,
  8: 24 * 3_600_000,
  9: 48 * 3_600_000,
  10: 72 * 3_600_000,
};

export function getBuildDurationMs(targetLevel: number): number {
  if (targetLevel <= LEVEL_SOFT_CAP) return BUILD_DURATION_TABLE[targetLevel] ?? 0;
  return BUILD_DURATION_TABLE[LEVEL_SOFT_CAP];
}

// Legacy lookup kept for callers that read it directly. Prefer
// getBuildDurationMs(targetLevel) for new code so >10 levels resolve correctly.
export const BUILD_DURATION_MS: { [targetLevel: number]: number } = BUILD_DURATION_TABLE;

export interface ActiveBuildJob {
  type: BuildingType;
  targetLevel: number;
  completesAt: number; // unix ms
  isOutpost?: boolean; // true when upgrading the Outpost itself
}

// Outpost upgrade: same geometric curve as buildings (base 500). At lvl 9→10
// = 250k CR, prestige levels (10→11+) keep climbing. Duration is 2× the
// equivalent building duration (saturated at level 10's 72h × 2 = 144h).
export function outpostUpgradeCost(currentLevel: number): number {
  return Math.round(500 * Math.pow(COST_GROWTH, currentLevel - 1));
}

export function outpostUpgradeDuration(targetLevel: number): number {
  return getBuildDurationMs(targetLevel) * 2;
}

// Prestige bonus: every outpost level above LEVEL_SOFT_CAP grants +5% credit
// yield on every spin (applied as a flat multiplier in useGameStore.spin).
// Stacks multiplicatively with anomalies, drones, and overclock.
export function getOutpostPrestigeMultiplier(outpostLevel: number): number {
  const prestige = Math.max(0, outpostLevel - LEVEL_SOFT_CAP);
  return 1 + prestige * 0.05;
}

export const AttackLogEntrySchema = z.object({
  attackerUid: z.string(),
  attackerName: z.string(),
  creditsStolen: z.number().int().min(0),
  shieldAbsorbed: z.boolean(),
  occurredAt: z.instanceof(Timestamp),
});
export type AttackLogEntry = z.infer<typeof AttackLogEntrySchema>;

export const RaidLogEntrySchema = z.object({
  raiderUid: z.string(),
  raiderName: z.string(),
  creditsStolen: z.number().int().min(0),
  occurredAt: z.instanceof(Timestamp),
});
export type RaidLogEntry = z.infer<typeof RaidLogEntrySchema>;

export const HabitatSchema = z.object({
  id: z.string(),
  ownerUid: z.string(),
  name: z.string().min(1).max(40),

  // Defense state
  hp: z.number().int().min(0).default(3),
  maxHp: z.number().int().min(1).default(3),
  activeShields: z.number().int().min(0).max(3).default(0),

  // Meta level (distinct from User.level — tracks outpost upgrades)
  outpostLevel: z.number().int().min(1).default(1),
  buildings: z.array(BuildingSchema).default([]),

  // Attack/raid history (keep last 20 entries each)
  attackLog: z.array(AttackLogEntrySchema).max(20).default([]),
  raidLog: z.array(RaidLogEntrySchema).max(20).default([]),

  // Timestamps
  createdAt: z.instanceof(Timestamp),
  updatedAt: z.instanceof(Timestamp),
});
export type Habitat = z.infer<typeof HabitatSchema>;

export const HabitatUpdateSchema = HabitatSchema.partial().omit({
  id: true,
  ownerUid: true,
  createdAt: true,
});
export type HabitatUpdate = z.infer<typeof HabitatUpdateSchema>;

// Credits stolen during a raid: base is 30% of defender's credits, capped by VAULT level
export function computeRaidLoot(defenderCredits: number, vaultLevel: number): number {
  const base = Math.floor(defenderCredits * 0.3);
  const reduction = vaultLevel * 0.05; // 5% per vault level, max 50% at lvl 10
  return Math.floor(base * (1 - Math.min(reduction, 0.5)));
}

// Damage dealt on an attack (returns whether a shield absorbed it)
export function computeAttackResult(activeShields: number): {
  hpDamage: number;
  shieldConsumed: boolean;
} {
  if (activeShields > 0) {
    return { hpDamage: 0, shieldConsumed: true };
  }
  return { hpDamage: 1, shieldConsumed: false };
}
