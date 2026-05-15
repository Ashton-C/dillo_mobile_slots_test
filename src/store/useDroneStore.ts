import { create } from 'zustand';
import { ActiveDrone, DroneContract, DroneType, DRONE_CONTRACTS } from '@/models/Drone';
import { droneService, DroneEffects } from '@/services/DroneMercenaryService';
import { anomalyService } from '@/services/AnomalyService';

// Apply anomaly discount/duration mods to a contract at the point of deploy.
// Idempotent — never mutates the static DRONE_CONTRACTS entry.
function effectiveContract(type: DroneType): DroneContract {
  const base = DRONE_CONTRACTS[type];
  const def = anomalyService.getDefinition();
  const costMult = def?.droneCostMultiplier ?? 1;
  const durMult  = def?.droneDurationMultiplier ?? 1;
  if (costMult === 1 && durMult === 1) return base;
  return {
    ...base,
    duration: Math.max(1, Math.round(base.duration * durMult)),
    cost: {
      credits: Math.ceil(base.cost.credits * costMult),
      attacks: Math.ceil(base.cost.attacks * costMult),
      raids:   Math.ceil(base.cost.raids   * costMult),
      shields: Math.ceil(base.cost.shields * costMult),
    },
  };
}

export { effectiveContract as effectiveDroneContract };

interface Resources {
  credits: number;
  attacks: number;
  raids: number;
  shields: number;
}

interface DroneState {
  activeDrones: ActiveDrone[];

  deployDrone: (type: DroneType, resources: Resources) => {
    success: boolean;
    reason?: string;
    costPaid: Partial<Resources>;
  };
  tickSpins: () => void;
  triggerAttackDefense: () => boolean;
  triggerRaidDefense: () => boolean;
  triggerRaidBoost: () => boolean;
  getEffects: () => DroneEffects;
  clearAll: () => void;
  debugDeployDrone: (type: DroneType) => void;
}

export const useDroneStore = create<DroneState>((set, get) => ({
  activeDrones: [],

  deployDrone(type, resources) {
    const contract = effectiveContract(type);

    if (!droneService.canAfford(contract, resources)) {
      return { success: false, reason: 'Insufficient resources', costPaid: {} };
    }

    const result = droneService.deployFromContract(contract, get().activeDrones);
    if (!result.success || !result.drone) {
      return { success: false, reason: result.reason, costPaid: {} };
    }

    set((state) => ({ activeDrones: [...state.activeDrones, result.drone!] }));

    return {
      success: true,
      costPaid: {
        credits: contract.cost.credits,
        attacks: contract.cost.attacks,
        raids: contract.cost.raids,
        shields: contract.cost.shields,
      },
    };
  },

  tickSpins() {
    set((state) => ({
      activeDrones: droneService.tickSpins(state.activeDrones),
    }));
  },

  triggerAttackDefense() {
    const { drones, consumed } = droneService.consumeOnAttack(get().activeDrones);
    if (consumed) set({ activeDrones: drones });
    return consumed;
  },

  triggerRaidDefense() {
    const { drones, consumed } = droneService.consumeOnRaid(get().activeDrones);
    if (consumed) set({ activeDrones: drones });
    return consumed;
  },

  triggerRaidBoost() {
    const { drones, consumed } = droneService.consumeOnRaidLaunch(get().activeDrones);
    if (consumed) set({ activeDrones: drones });
    return consumed;
  },

  getEffects() {
    return droneService.computeEffects(get().activeDrones);
  },

  clearAll() {
    set({ activeDrones: [] });
  },

  debugDeployDrone(type) {
    const contract = DRONE_CONTRACTS[type];
    const drone: ActiveDrone = {
      id: Math.random().toString(36).slice(2),
      type,
      deployedAt: Date.now(),
      spinsRemaining: contract.trigger === 'ON_SPIN' ? contract.duration : null,
    };
    set((state) => ({ activeDrones: [...state.activeDrones, drone] }));
  },
}));
