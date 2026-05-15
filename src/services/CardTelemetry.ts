import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';

// Lightweight client-side telemetry for the card system. One Firestore
// write per event — cheap at closed-testing scale. Disable via the
// `TELEMETRY_ENABLED` flag if scale becomes a concern.
//
// Server-side activations (raid card consumption) are logged from
// resolveCombat directly so the record includes outcome data. Reel-card
// drops + activations are logged from the client because the server
// doesn't observe the spin loop.

const TELEMETRY_ENABLED = true;

export type CardTelemetryEvent =
  | { kind: 'DROP'; cardId: string; tier: 'MINOR' | 'MAJOR'; rarity: string; autoShredded: boolean }
  | { kind: 'ACTIVATE_REEL'; cardId: string; spinDuration: number }
  | { kind: 'SHRED'; cardId: string; refundCredits: number };

export async function logCardEvent(event: CardTelemetryEvent): Promise<void> {
  if (!TELEMETRY_ENABLED) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await addDoc(collection(db, 'cardTelemetry'), {
      uid,
      ...event,
      timestamp: serverTimestamp(),
    });
  } catch (err) {
    // Telemetry failures are non-fatal.
    if (__DEV__) console.warn('[telemetry] write failed', err);
  }
}
