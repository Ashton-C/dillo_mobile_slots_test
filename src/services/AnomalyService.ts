import {
  doc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// --- Anomaly Definitions ---

export type AnomalyId =
  | 'SOLAR_SURGE'
  | 'CREDIT_BLOOM'
  | 'RAID_SHADOW'
  | 'CHRONO_BLOOM'
  | 'FUEL_FLOOD'
  | 'RIFT_TIDES'
  | 'OUTPOST_ECLIPSE'
  | 'DRONE_SURGE'
  | 'MARKED_PILOT'
  | 'MIRROR_REELS'
  | 'STARDUST_WAKE'
  | 'SCRAMBLE_FIELD'
  | 'HARVEST_MOON';

export interface AnomalyDefinition {
  id: AnomalyId;
  name: string;
  description: string;
  flavour: string;
  color: string;

  // Reward multipliers (defaults: 1 / 0)
  creditMultiplier: number;
  attackMultiplier: number;
  shieldBonus: number;
  raidLootBonus: number;
  riftCostMultiplier: number;

  // Habitat
  buildSpeedMultiplier?: number;
  buildJumpMs?: number;

  // Spin energy
  spinRefillMultiplier?: number;

  // Rift
  riftTierBoost?: number;
  riftDisabled?: boolean;

  // Slot engine
  mirrorReelsEnabled?: boolean;
  scrambleWeightsEnabled?: boolean;

  // Combat (server-enforced)
  defensesDisabled?: boolean;
  markedPilotEnabled?: boolean;
  markedLootMultiplier?: number;

  // Drones
  droneCostMultiplier?: number;
  droneDurationMultiplier?: number;

  // Generator
  generatorForegroundMultiplier?: number;
  generatorIdleDisabled?: boolean;

  // Economy
  stardustGrantInterval?: number;
  stardustGrantAmount?: number;
}

export const ANOMALIES: Record<AnomalyId, AnomalyDefinition> = {
  SOLAR_SURGE: {
    id: 'SOLAR_SURGE',
    name: 'SOLAR SURGE',
    description: 'Solar winds supercharge the Generator. Credit yields are doubled.',
    flavour: '"Sun\'s out. Credits too."',
    color: '#FFD700',
    creditMultiplier: 2,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
  },
  CREDIT_BLOOM: {
    id: 'CREDIT_BLOOM',
    name: 'CREDIT BLOOM',
    description: 'Temporal Rift activation costs halved. Credit yields up 25%.',
    flavour: '"The drift is generous today."',
    color: '#9B59FF',
    creditMultiplier: 1.25,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 0.5,
  },
  RAID_SHADOW: {
    id: 'RAID_SHADOW',
    name: 'RAID SHADOW',
    description: 'Stealth conditions amplify raid loot by 50%.',
    flavour: '"Ghost run. Take what\'s theirs."',
    color: '#FF6B35',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0.5,
    riftCostMultiplier: 1,
  },
  CHRONO_BLOOM: {
    id: 'CHRONO_BLOOM',
    name: 'CHRONO BLOOM',
    description: 'Build times run at 2× speed. Active jobs jump forward one hour on arrival.',
    flavour: '"Time slips. Steel doesn\'t."',
    color: '#5EE6D6',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
    buildSpeedMultiplier: 2,
    buildJumpMs: 60 * 60 * 1000,
  },
  FUEL_FLOOD: {
    id: 'FUEL_FLOOD',
    name: 'FUEL FLOOD',
    description: 'Spin energy refills at 1 per minute, not 1 per 5 minutes.',
    flavour: '"Tanks topped. Burn it before the gauge drops."',
    color: '#FFB347',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
    spinRefillMultiplier: 5,
  },
  RIFT_TIDES: {
    id: 'RIFT_TIDES',
    name: 'RIFT TIDES',
    description: 'Your active Temporal Rift runs one tier higher than purchased.',
    flavour: '"Ride the tide. The reels lean your way."',
    color: '#7B9FFF',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
    riftTierBoost: 1,
  },
  OUTPOST_ECLIPSE: {
    id: 'OUTPOST_ECLIPSE',
    name: 'OUTPOST ECLIPSE',
    description: 'TURRET and VAULT passives offline sector-wide. Raw skill only.',
    flavour: '"Defenses down. Everyone\'s a target."',
    color: '#C92A2A',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
    defensesDisabled: true,
  },
  DRONE_SURGE: {
    id: 'DRONE_SURGE',
    name: 'DRONE SURGE',
    description: 'Drone contracts cost 50% less and last twice as long.',
    flavour: '"Fleet\'s cheap. Stock up."',
    color: '#39FF14',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
    droneCostMultiplier: 0.5,
    droneDurationMultiplier: 2,
  },
  MARKED_PILOT: {
    id: 'MARKED_PILOT',
    name: 'MARKED PILOT',
    description: 'Each hour a pilot is marked. Marked targets drop 3× loot. Could be you.',
    flavour: '"Sector\'s watching. Hope it isn\'t you."',
    color: '#E83E8C',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
    markedPilotEnabled: true,
    markedLootMultiplier: 3,
  },
  MIRROR_REELS: {
    id: 'MIRROR_REELS',
    name: 'MIRROR REELS',
    description: 'Symmetric pairs across the 5×5 grid trigger bonus payouts. Requires Outpost LVL 10+.',
    flavour: '"Watch the edges. Twins pay."',
    color: '#BFE3FF',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
    mirrorReelsEnabled: true,
  },
  STARDUST_WAKE: {
    id: 'STARDUST_WAKE',
    name: 'STARDUST WAKE',
    description: 'Every 10th spin awards 1 ✦ Stardust. Free.',
    flavour: '"Dust on the wind. Catch what falls."',
    color: '#D6BCFA',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
    stardustGrantInterval: 10,
    stardustGrantAmount: 1,
  },
  SCRAMBLE_FIELD: {
    id: 'SCRAMBLE_FIELD',
    name: 'SCRAMBLE FIELD',
    description: 'Reel weights randomize each spin. Temporal Rifts disabled.',
    flavour: '"Drift broke. Pull and pray."',
    color: '#999AB5',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
    scrambleWeightsEnabled: true,
    riftDisabled: true,
  },
  HARVEST_MOON: {
    id: 'HARVEST_MOON',
    name: 'HARVEST MOON',
    description: 'Generators yield 3× credits — but only while you\'re on-screen. Idle income paused.',
    flavour: '"Stand watch. The harvest waits for no one."',
    color: '#FFA94D',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
    generatorForegroundMultiplier: 3,
    generatorIdleDisabled: true,
  },
};

const ANOMALIES_DOC = 'anomalies/current';

export interface ActiveAnomaly {
  id: AnomalyId;
  startedAt: number;
  endsAt: number;
}

// --- Service ---

export class AnomalyService {
  private currentAnomaly: ActiveAnomaly | null = null;

  subscribe(onUpdate: (anomaly: ActiveAnomaly, def: AnomalyDefinition) => void): Unsubscribe {
    const ref = doc(db, ANOMALIES_DOC);

    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;

      const data = snap.data() as ActiveAnomaly;
      if (data.endsAt < Date.now()) return;

      // Defensive: ignore retired ids that may still be in Firestore until the
      // next seedAnomaly run rewrites the doc.
      if (!ANOMALIES[data.id]) return;

      this.currentAnomaly = data;
      onUpdate(data, ANOMALIES[data.id]);
    });
  }

  getDefinition(): AnomalyDefinition | null {
    if (!this.currentAnomaly) return null;
    return ANOMALIES[this.currentAnomaly.id] ?? null;
  }

  applyToCredits(baseCredits: number): number {
    const def = this.getDefinition();
    if (!def) return baseCredits;
    return Math.floor(baseCredits * def.creditMultiplier);
  }

  applyToRiftCost(baseCost: number): number {
    const def = this.getDefinition();
    if (!def) return baseCost;
    return Math.floor(baseCost * def.riftCostMultiplier);
  }

  msUntilNextAnomaly(): number {
    if (!this.currentAnomaly) return 0;
    return Math.max(0, this.currentAnomaly.endsAt - Date.now());
  }
}

export const anomalyService = new AnomalyService();
