import { create } from 'zustand';
import { anomalyService, ActiveAnomaly, AnomalyDefinition } from '@/services/AnomalyService';

interface AnomalyState {
  activeAnomaly: ActiveAnomaly | null;
  definition: AnomalyDefinition | null;
  msRemaining: number;
  subscribe: () => () => void;
  tick: () => void;
}

export const useAnomalyStore = create<AnomalyState>((set, get) => ({
  activeAnomaly: null,
  definition: null,
  msRemaining: 0,

  subscribe() {
    const unsub = anomalyService.subscribe((anomaly, def) => {
      set({
        activeAnomaly: anomaly,
        definition: def,
        msRemaining: Math.max(0, anomaly.endsAt - Date.now()),
      });
    });
    return unsub;
  },

  tick() {
    const { activeAnomaly } = get();
    if (!activeAnomaly) return;
    set({ msRemaining: Math.max(0, activeAnomaly.endsAt - Date.now()) });
  },
}));
