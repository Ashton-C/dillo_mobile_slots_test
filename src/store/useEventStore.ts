import { create } from 'zustand';
import { subscribeToEvents, markEventRead, GameEvent } from '@/services/FirestoreService';
import { auth } from '@/lib/firebase';
import { useGameStore } from '@/store/useGameStore';

interface EventState {
  events: GameEvent[];
  activeEvent: GameEvent | null;
  ownerUid: string | null;
  // Wall-clock cutoff for the PILOT tab "unread" dot. Anything with a
  // `timestamp` greater than this is considered new since last visit.
  pilotLastSeenAt: number;
  subscribe: (uid: string) => () => void;
  dismissActive: () => void;
  markPilotSeen: () => void;
  unreadPilotCount: () => number;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  activeEvent: null,
  ownerUid: null,
  pilotLastSeenAt: 0,

  subscribe(uid) {
    set({ ownerUid: uid });
    return subscribeToEvents(uid, (event, isInitialLoad) => {
      set((s) => {
        const alreadyExists = s.events.some((e) => e.id === event.id);
        if (alreadyExists) return s;
        if (event.type === 'RAID_RESOLVED' && !isInitialLoad) {
          useGameStore.getState().recordRaidSuffered();
        }
        // Banner suppression rules:
        //  - never banner during the initial Firestore snapshot (those are
        //    historical events the user has already seen)
        //  - never banner the user's own outgoing combat results — that's
        //    just confirmation, the pilot log already shows it
        //  - read events stay out of the banner queue
        const skipBanner = isInitialLoad
          || event.type === 'COMBAT_RESULT'
          || event.read;
        return {
          events: [event, ...s.events].slice(0, 50),
          activeEvent: skipBanner ? s.activeEvent : (s.activeEvent ?? event),
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

  markPilotSeen() {
    set({ pilotLastSeenAt: Date.now() });
  },

  unreadPilotCount() {
    const { events, pilotLastSeenAt } = get();
    return events.filter((e) => e.timestamp > pilotLastSeenAt).length;
  },
}));
