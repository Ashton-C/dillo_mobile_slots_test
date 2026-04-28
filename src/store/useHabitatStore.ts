import { create } from 'zustand';
import {
  BuildingType,
  BUILDING_UPGRADE_COST,
  BUILD_DURATION_MS,
  ActiveBuildJob,
} from '@/models/Habitat';
import { writeHabitatState, HabitatSnapshot } from '@/services/FirestoreService';

interface HabitatState {
  habitatId: string | null;
  buildingLevels: Partial<Record<BuildingType, number>>;
  activeBuildJob: ActiveBuildJob | null;
  msUntilComplete: number;

  setHabitatId: (id: string) => void;
  startBuild: (type: BuildingType, subtractCredits: (n: number) => boolean) => boolean;
  tick: () => void;
  syncFromFirestore: (data: HabitatSnapshot) => void;
}

function persist(habitatId: string | null, data: Partial<HabitatSnapshot>) {
  if (habitatId) writeHabitatState(habitatId, data).catch(console.error);
}

export const useHabitatStore = create<HabitatState>((set, get) => ({
  habitatId: null,
  buildingLevels: {},
  activeBuildJob: null,
  msUntilComplete: 0,

  setHabitatId(id) {
    set({ habitatId: id });
  },

  startBuild(type, subtractCredits) {
    const { activeBuildJob, buildingLevels, habitatId } = get();
    if (activeBuildJob) return false; // builder is busy

    const currentLevel = buildingLevels[type] ?? 0;
    if (currentLevel >= 10) return false;

    const targetLevel = currentLevel + 1;
    const cost = BUILDING_UPGRADE_COST[type](currentLevel === 0 ? 1 : currentLevel);
    if (!subtractCredits(cost)) return false;

    const duration = BUILD_DURATION_MS[targetLevel] ?? 0;
    const completesAt = Date.now() + duration;
    const job: ActiveBuildJob = { type, targetLevel, completesAt };

    set({ activeBuildJob: job, msUntilComplete: duration });
    persist(habitatId, { activeBuildJob: job });
    return true;
  },

  tick() {
    const { activeBuildJob, buildingLevels, habitatId } = get();
    if (!activeBuildJob) return;

    const ms = Math.max(0, activeBuildJob.completesAt - Date.now());

    if (ms === 0) {
      // Build complete — increment level and clear job
      const newLevels = {
        ...buildingLevels,
        [activeBuildJob.type]: activeBuildJob.targetLevel,
      };
      set({ buildingLevels: newLevels, activeBuildJob: null, msUntilComplete: 0 });
      persist(habitatId, { buildingLevels: newLevels, activeBuildJob: null });
    } else {
      set({ msUntilComplete: ms });
    }
  },

  syncFromFirestore(data) {
    const job = data.activeBuildJob;
    set({
      buildingLevels: data.buildingLevels,
      activeBuildJob: job,
      msUntilComplete: job ? Math.max(0, job.completesAt - Date.now()) : 0,
    });
  },
}));
