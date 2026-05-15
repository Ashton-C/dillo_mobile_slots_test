import { create } from 'zustand';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { anomalyService, ActiveAnomaly, AnomalyDefinition, AnomalyId, ANOMALIES } from '@/services/AnomalyService';

interface AnomalyState {
  activeAnomaly: ActiveAnomaly | null;
  definition: AnomalyDefinition | null;
  msRemaining: number;
  // markedUntil for the local player. Server-written by markRandomPilot CF.
  // 0 = not marked; future ms = marked until that time.
  myMarkedUntil: number;
  subscribe: () => () => void;
  subscribeToMyMark: (uid: string) => () => void;
  tick: () => void;
  debugForceAnomaly: (id: AnomalyId) => void;
}

const DEBUG_ANOMALY_DURATION_MS = 60 * 60 * 1000; // 1 hour

export const useAnomalyStore = create<AnomalyState>((set, get) => ({
  activeAnomaly: null,
  definition: null,
  msRemaining: 0,
  myMarkedUntil: 0,

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

  subscribeToMyMark(uid) {
    const ref = doc(db, 'playerIndex', uid);
    return onSnapshot(ref, (snap) => {
      const data = snap.data();
      const markedUntil = (data?.markedUntil as number | undefined) ?? 0;
      set({ myMarkedUntil: markedUntil });
    });
  },

  tick() {
    const { activeAnomaly } = get();
    if (!activeAnomaly) return;
    set({ msRemaining: Math.max(0, activeAnomaly.endsAt - Date.now()) });
  },

  debugForceAnomaly(id) {
    const now = Date.now();
    const anomaly: ActiveAnomaly = { id, startedAt: now, endsAt: now + DEBUG_ANOMALY_DURATION_MS };
    set({ activeAnomaly: anomaly, definition: ANOMALIES[id], msRemaining: DEBUG_ANOMALY_DURATION_MS });
  },
}));
