import { create } from 'zustand';
import { subscribeToEvents, markEventRead, GameEvent } from '@/services/FirestoreService';
import { auth } from '@/lib/firebase';

interface EventState {
  events: GameEvent[];
  activeEvent: GameEvent | null;
  ownerUid: string | null;
  subscribe: (uid: string) => () => void;
  dismissActive: () => void;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  activeEvent: null,
  ownerUid: null,

  subscribe(uid) {
    set({ ownerUid: uid });
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
    const { activeEvent, events, ownerUid } = get();
    // Use the stored owner UID — events live at users/{myUid}/events, not the sender's path
    const uid = ownerUid ?? auth.currentUser?.uid;
    if (activeEvent && !activeEvent.read && uid) {
      markEventRead(uid, activeEvent.id).catch(console.error);
    }
    const remaining = events.filter((e) => e.id !== activeEvent?.id && !e.read);
    set({ activeEvent: remaining[0] ?? null });
  },
}));
