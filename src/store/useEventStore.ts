import { create } from 'zustand';
import { subscribeToEvents, markEventRead, GameEvent } from '@/services/FirestoreService';

interface EventState {
  events: GameEvent[];
  activeEvent: GameEvent | null;
  subscribe: (uid: string) => () => void;
  dismissActive: () => void;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  activeEvent: null,

  subscribe(uid) {
    return subscribeToEvents(uid, (event) => {
      set((s) => {
        const alreadyExists = s.events.some((e) => e.id === event.id);
        if (alreadyExists) return s;
        return {
          events: [event, ...s.events].slice(0, 50),
          activeEvent: s.activeEvent ?? event,
        };
      });
    });
  },

  dismissActive() {
    const { activeEvent, events } = get();
    if (activeEvent && !activeEvent.read) {
      markEventRead(activeEvent.fromUid, activeEvent.id).catch(console.error);
    }
    const remaining = events.filter((e) => e.id !== activeEvent?.id && !e.read);
    set({ activeEvent: remaining[0] ?? null });
  },
}));
