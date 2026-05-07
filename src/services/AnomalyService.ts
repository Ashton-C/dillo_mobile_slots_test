import {
  doc,
  onSnapshot,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { TemporalRiftTier } from '@/services/SlotsEngine';

// --- Anomaly Definitions ---

export type AnomalyId =
  | 'SOLAR_SURGE'
  | 'VOID_STORM'
  | 'CREDIT_BLOOM'
  | 'SHIELD_PULSE'
  | 'RAID_SHADOW'
  | 'CALM';

export interface AnomalyDefinition {
  id: AnomalyId;
  name: string;
  description: string;
  flavour: string;
  color: string;
  // Modifiers applied on top of base spin weights and rewards
  creditMultiplier: number;
  attackMultiplier: number;   // multiplies attacksWon
  shieldBonus: number;        // flat shields added per spin that yields any shield
  raidLootBonus: number;      // added to raid loot percentage
  riftCostMultiplier: number; // multiplies Temporal Rift credit cost (0.5 = half price)
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
  VOID_STORM: {
    id: 'VOID_STORM',
    name: 'VOID STORM',
    description: 'A storm of dark energy supercharges attack drones across the sector.',
    flavour: '"Ride through it. Or don\'t."',
    color: '#FF3366',
    creditMultiplier: 0.75,
    attackMultiplier: 2,
    shieldBonus: 0,
    raidLootBonus: 0.2,
    riftCostMultiplier: 1,
  },
  CREDIT_BLOOM: {
    id: 'CREDIT_BLOOM',
    name: 'CREDIT BLOOM',
    description: 'Temporal Rift activation costs halved. Jackpot payouts increased.',
    flavour: '"The drift is generous today."',
    color: '#9B59FF',
    creditMultiplier: 1.5,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 0.5,
  },
  SHIELD_PULSE: {
    id: 'SHIELD_PULSE',
    name: 'SHIELD PULSE',
    description: 'Electromagnetic pulse strengthens outpost shields sector-wide.',
    flavour: '"Hard to kill right now. Make use of it."',
    color: '#00D4FF',
    creditMultiplier: 1,
    attackMultiplier: 0.5,
    shieldBonus: 1,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
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
  CALM: {
    id: 'CALM',
    name: 'DEEP CALM',
    description: 'Sector conditions are nominal. Standard odds apply.',
    flavour: '"Dead quiet on the wire. For now."',
    color: '#4A4A7A',
    creditMultiplier: 1,
    attackMultiplier: 1,
    shieldBonus: 0,
    raidLootBonus: 0,
    riftCostMultiplier: 1,
  },
};

const ANOMALIES_DOC = 'anomalies/current';

export interface ActiveAnomaly {
  id: AnomalyId;
  startedAt: number; // epoch ms
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

      this.currentAnomaly = data;
      onUpdate(data, ANOMALIES[data.id]);
    });
  }

  getDefinition(): AnomalyDefinition | null {
    if (!this.currentAnomaly) return null;
    return ANOMALIES[this.currentAnomaly.id];
  }

  // Apply anomaly modifiers to credit wins
  applyToCredits(baseCredits: number): number {
    const def = this.getDefinition();
    if (!def) return baseCredits;
    return Math.floor(baseCredits * def.creditMultiplier);
  }

  // Apply anomaly modifier to Rift cost
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
