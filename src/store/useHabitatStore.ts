import { create } from 'zustand';
import {
  BuildingType,
  BUILDING_UPGRADE_COST,
  BUILD_DURATION_MS,
  ActiveBuildJob,
  outpostUpgradeCost,
  outpostUpgradeDuration,
} from '@/models/Habitat';
import { writeHabitatState, HabitatSnapshot } from '@/services/FirestoreService';

interface HabitatState {
  habitatId: string | null;
  buildingLevels: Partial<Record<BuildingType, number>>;
  outpostLevel: number;
  activeBuildJob: ActiveBuildJob | null;
  msUntilComplete: number;
  completedBuilding: BuildingType | null;

  setHabitatId: (id: string) => void;
  startBuild: (type: BuildingType, subtractCredits: (n: number) => boolean) => boolean;
  upgradeOutpost: (subtractCredits: (n: number) => boolean) => boolean;
  tick: () => void;
  syncFromFirestore: (data: HabitatSnapshot) => void;
  clearCompletedBuilding: () => void;
}

function persist(habitatId: string | null, data: Partial<HabitatSnapshot>) {
  if (habitatId) writeHabitatState(habitatId, data).catch(console.error);
}

export function getNumActiveLines(outpostLevel: number): 1 | 3 | 5 {
  if (outpostLevel >= 6) return 5;
  if (outpostLevel >= 3) return 3;
  return 1;
}

export const useHabitatStore = create<HabitatState>((set, get) => ({
  habitatId: null,
  buildingLevels: {},
  outpostLevel: 1,
  activeBuildJob: null,
  msUntilComplete: 0,
  completedBuilding: null,

  setHabitatId(id) {
    set({ habitatId: id });
  },

  startBuild(type, subtractCredits) {
    const { activeBuildJob, buildingLevels, outpostLevel, habitatId } = get();
    if (activeBuildJob) return false;

    const currentLevel = buildingLevels[type] ?? 0;
    const targetLevel = currentLevel + 1;

    if (targetLevel > outpostLevel) return false; // hard gate
    if (currentLevel >= 10) return false;

    const cost = BUILDING_UPGRADE_COST[type](currentLevel === 0 ? 1 : currentLevel);
    if (!subtractCredits(cost)) return false;

    const duration = BUILD_DURATION_MS[targetLevel] ?? 0;
    const completesAt = Date.now() + duration;
    const job: ActiveBuildJob = { type, targetLevel, completesAt };

    set({ activeBuildJob: job, msUntilComplete: duration });
    persist(habitatId, { activeBuildJob: job });
    return true;
  },

  upgradeOutpost(subtractCredits) {
    const { activeBuildJob, outpostLevel, habitatId } = get();
    if (activeBuildJob) return false;
    if (outpostLevel >= 10) return false;

    const cost = outpostUpgradeCost(outpostLevel);
    if (!subtractCredits(cost)) return false;

    const targetLevel = outpostLevel + 1;
    const duration = outpostUpgradeDuration(targetLevel);
    const completesAt = Date.now() + duration;
    const job: ActiveBuildJob = { type: 'GENERATOR', targetLevel, completesAt, isOutpost: true };

    set({ activeBuildJob: job, msUntilComplete: duration });
    persist(habitatId, { activeBuildJob: job });
    return true;
  },

  tick() {
    const { activeBuildJob, buildingLevels, outpostLevel, habitatId } = get();
    if (!activeBuildJob) return;

    const ms = Math.max(0, activeBuildJob.completesAt - Date.now());

    if (ms === 0) {
      if (activeBuildJob.isOutpost) {
        const newOutpostLevel = activeBuildJob.targetLevel;
        set({ outpostLevel: newOutpostLevel, activeBuildJob: null, msUntilComplete: 0 });
        persist(habitatId, { outpostLevel: newOutpostLevel, activeBuildJob: null });
      } else {
        const newLevels = {
          ...buildingLevels,
          [activeBuildJob.type]: activeBuildJob.targetLevel,
        };
        const completedType = activeBuildJob.type;
        set({ buildingLevels: newLevels, activeBuildJob: null, msUntilComplete: 0, completedBuilding: completedType });
        persist(habitatId, { buildingLevels: newLevels, activeBuildJob: null });
      }
    } else {
      set({ msUntilComplete: ms });
    }
  },

  syncFromFirestore(data) {
    const job = data.activeBuildJob;
    set({
      buildingLevels: data.buildingLevels,
      outpostLevel: data.outpostLevel ?? 1,
      activeBuildJob: job,
      msUntilComplete: job ? Math.max(0, job.completesAt - Date.now()) : 0,
    });
  },

  clearCompletedBuilding() {
    set({ completedBuilding: null });
  },
}));
