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
]);
export type BuildingType = z.infer<typeof BuildingType>;

export const BuildingSchema = z.object({
  type: BuildingType,
  level: z.number().int().min(1).max(10).default(1),
  builtAt: z.instanceof(Timestamp),
});
export type Building = z.infer<typeof BuildingSchema>;

// Upgrade cost (credits) for each building level
export const BUILDING_UPGRADE_COST: Record<BuildingType, (level: number) => number> = {
  GENERATOR: (lvl) => 200 * lvl,
  ARMORY: (lvl) => 300 * lvl,
  VAULT: (lvl) => 350 * lvl,
  TURRET: (lvl) => 500 * lvl,
  HANGAR: (lvl) => 1000 * lvl,
};

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
