import { ActiveDrone, DroneContract, DroneType, DRONE_CONTRACTS } from '@/models/Drone';

let _nextId = 1;
function generateId(): string {
  return `drone_${Date.now()}_${_nextId++}`;
}

export interface DeployResult {
  success: boolean;
  reason?: string;
  drone?: ActiveDrone;
}

export interface DroneEffects {
  creditMultiplier: number;
  raidLootBonus: number;
  blocksNextAttack: boolean;
  blocksNextRaid: boolean;
}

export class DroneMercenaryService {
  // --- Deployment ---

  deploy(type: DroneType, activeDrones: ActiveDrone[]): DeployResult {
    const contract = DRONE_CONTRACTS[type];
    const currentCount = activeDrones.filter((d) => d.type === type).length;

    if (currentCount >= contract.maxDeployed) {
      return { success: false, reason: `Max ${contract.maxDeployed} ${contract.label} deployed` };
    }

    const drone: ActiveDrone = {
      id: generateId(),
      type,
      deployedAt: Date.now(),
      spinsRemaining: contract.trigger === 'ON_SPIN' ? contract.duration : null,
    };

    return { success: true, drone };
  }

  // --- Spin tick: decrement ON_SPIN drones and remove expired ---

  tickSpins(activeDrones: ActiveDrone[]): ActiveDrone[] {
    return activeDrones
      .map((drone) => {
        if (drone.spinsRemaining === null) return drone;
        return { ...drone, spinsRemaining: drone.spinsRemaining - 1 };
      })
      .filter((drone) => drone.spinsRemaining === null || drone.spinsRemaining > 0);
  }

  // --- Event consumption: remove first matching event-triggered drone ---

  consumeOnAttack(activeDrones: ActiveDrone[]): { drones: ActiveDrone[]; consumed: boolean } {
    const idx = activeDrones.findIndex((d) => d.type === 'SENTINEL');
    if (idx === -1) return { drones: activeDrones, consumed: false };
    const drones = [...activeDrones];
    drones.splice(idx, 1);
    return { drones, consumed: true };
  }

  consumeOnRaid(activeDrones: ActiveDrone[]): { drones: ActiveDrone[]; consumed: boolean } {
    const idx = activeDrones.findIndex((d) => d.type === 'SCRAMBLER');
    if (idx === -1) return { drones: activeDrones, consumed: false };
    const drones = [...activeDrones];
    drones.splice(idx, 1);
    return { drones, consumed: true };
  }

  consumeOnRaidLaunch(activeDrones: ActiveDrone[]): { drones: ActiveDrone[]; consumed: boolean } {
    const idx = activeDrones.findIndex((d) => d.type === 'RAIDER');
    if (idx === -1) return { drones: activeDrones, consumed: false };
    const drones = [...activeDrones];
    drones.splice(idx, 1);
    return { drones, consumed: true };
  }

  // --- Aggregate effects from all active drones ---

  computeEffects(activeDrones: ActiveDrone[]): DroneEffects {
    const effects: DroneEffects = {
      creditMultiplier: 1,
      raidLootBonus: 0,
      blocksNextAttack: false,
      blocksNextRaid: false,
    };

    for (const drone of activeDrones) {
      const { effect } = DRONE_CONTRACTS[drone.type];
      // Multipliers stack multiplicatively
      effects.creditMultiplier *= effect.creditMultiplier;
      effects.raidLootBonus += effect.raidLootBonus;
      if (effect.blocksAttack) effects.blocksNextAttack = true;
      if (effect.blocksRaid) effects.blocksNextRaid = true;
    }

    return effects;
  }

  // --- Cost validation ---

  canAfford(
    contract: DroneContract,
    resources: { credits: number; attacks: number; raids: number; shields: number },
  ): boolean {
    return (
      resources.credits >= contract.cost.credits &&
      resources.attacks >= contract.cost.attacks &&
      resources.raids >= contract.cost.raids &&
      resources.shields >= contract.cost.shields
    );
  }
}

export const droneService = new DroneMercenaryService();
