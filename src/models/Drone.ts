import { z } from 'zod';

export const DroneType = z.enum([
  'SENTINEL',   // blocks the next incoming attack
  'SCRAMBLER',  // blocks the next incoming raid
  'HARVESTER',  // boosts credit yield for N spins
  'RAIDER',     // boosts loot from next raid
]);
export type DroneType = z.infer<typeof DroneType>;

export const DroneTrigger = z.enum([
  'ON_ATTACK',  // consumed when defender is attacked
  'ON_RAID',    // consumed when defender is raided
  'ON_SPIN',    // consumed each spin (countdown)
  'ON_RAID_LAUNCH', // consumed when owner launches a raid
]);
export type DroneTrigger = z.infer<typeof DroneTrigger>;

export const DroneContractSchema = z.object({
  type: DroneType,
  label: z.string(),
  description: z.string(),
  flavour: z.string(),
  trigger: DroneTrigger,
  // Duration: for ON_SPIN drones this is spin count; for event drones it's 1
  duration: z.number().int().min(1),
  cost: z.object({
    credits: z.number().int().min(0).default(0),
    attacks: z.number().int().min(0).default(0),
    raids: z.number().int().min(0).default(0),
    shields: z.number().int().min(0).default(0),
  }),
  // Effect modifiers applied while drone is active
  effect: z.object({
    creditMultiplier: z.number().default(1),  // multiply credits won per spin
    raidLootBonus: z.number().default(0),     // flat % added to raid loot calculation
    blocksAttack: z.boolean().default(false),
    blocksRaid: z.boolean().default(false),
  }),
  maxDeployed: z.number().int().min(1).default(2), // cap per drone type
});
export type DroneContract = z.infer<typeof DroneContractSchema>;

export const ActiveDroneSchema = z.object({
  id: z.string(),           // uuid
  type: DroneType,
  deployedAt: z.number(),   // Date.now()
  spinsRemaining: z.number().int().min(0).nullable(), // null = event-triggered
});
export type ActiveDrone = z.infer<typeof ActiveDroneSchema>;

// --- Contract Definitions ---

export const DRONE_CONTRACTS: Record<DroneType, DroneContract> = {
  SENTINEL: {
    type: 'SENTINEL',
    label: 'SENTINEL',
    description: 'Absorbs the next attack on your homestead.',
    flavour: '"It watches the homestead. You don\'t have to."',
    trigger: 'ON_ATTACK',
    duration: 1,
    cost: { credits: 0, attacks: 0, raids: 0, shields: 2 },
    effect: { creditMultiplier: 1, raidLootBonus: 0, blocksAttack: true, blocksRaid: false },
    maxDeployed: 3,
  },
  SCRAMBLER: {
    type: 'SCRAMBLER',
    label: 'SCRAMBLER',
    description: 'Jams the next raid on your homestead, sending raiders away empty-handed.',
    flavour: '"Scrambled the wire. They\'re flying blind."',
    trigger: 'ON_RAID',
    duration: 1,
    cost: { credits: 150, attacks: 0, raids: 0, shields: 0 },
    effect: { creditMultiplier: 1, raidLootBonus: 0, blocksAttack: false, blocksRaid: true },
    maxDeployed: 2,
  },
  HARVESTER: {
    type: 'HARVESTER',
    label: 'HARVESTER',
    description: 'Boosts credit yield by 75% for the next 8 spins.',
    flavour: '"Pull everything. Leave nothing."',
    trigger: 'ON_SPIN',
    duration: 8,
    cost: { credits: 200, attacks: 0, raids: 0, shields: 0 },
    effect: { creditMultiplier: 1.75, raidLootBonus: 0, blocksAttack: false, blocksRaid: false },
    maxDeployed: 1,
  },
  RAIDER: {
    type: 'RAIDER',
    label: 'RAIDER',
    description: 'Boosts loot stolen on your next raid by 40%.',
    flavour: '"In and out before they know you\'re gone."',
    trigger: 'ON_RAID_LAUNCH',
    duration: 1,
    cost: { credits: 0, attacks: 0, raids: 1, shields: 0 },
    effect: { creditMultiplier: 1, raidLootBonus: 0.4, blocksAttack: false, blocksRaid: false },
    maxDeployed: 2,
  },
};
