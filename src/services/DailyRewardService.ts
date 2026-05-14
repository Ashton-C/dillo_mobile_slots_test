import { httpsCallable } from 'firebase/functions';
import { functions } from '@/lib/firebase';

export interface DailyReward {
  credits?: number;
  stardust?: number;
  fuel?: number;
  boost?: number;
  shields?: number;
  spinRefill?: boolean;
}

export interface DailyClaimResult {
  streak: number;
  reward: DailyReward;
  claimedAt: number;
}

// Window constants mirror the values in functions/src/index.ts. The client
// uses them only to drive the "ready to claim?" check on app open; the server
// remains authoritative.
export const DAILY_CLAIM_WINDOW_MIN_MS = 22 * 60 * 60 * 1000;
export const DAILY_CLAIM_WINDOW_MAX_MS = 48 * 60 * 60 * 1000;

export function isDailyClaimReady(lastDailyClaimAt: number): boolean {
  if (!lastDailyClaimAt) return true;
  return Date.now() - lastDailyClaimAt >= DAILY_CLAIM_WINDOW_MIN_MS;
}

// Returns the streak number that would result if the player claimed right
// now — used by the modal to preview "Day N reward". Mirrors the server's
// reset logic so the preview matches what they actually get.
export function previewClaimStreak(prevStreak: number, lastDailyClaimAt: number): number {
  if (!lastDailyClaimAt) return 1;
  const elapsed = Date.now() - lastDailyClaimAt;
  if (elapsed > DAILY_CLAIM_WINDOW_MAX_MS) return 1;
  return prevStreak + 1;
}

const REWARDS: Record<number, DailyReward> = {
  1: { credits: 200 },
  2: { credits: 400,  fuel: 1 },
  3: { credits: 600,  boost: 1 },
  4: { credits: 1000, shields: 2 },
  5: { credits: 1500, stardust: 5 },
  6: { credits: 2200, fuel: 2, boost: 2 },
  7: { credits: 5000, stardust: 20, spinRefill: true },
};

export function previewRewardForStreak(streak: number): DailyReward {
  const slot = ((streak - 1) % 7) + 1;
  const base = REWARDS[slot] ?? { credits: 200 };
  if (slot === 7 && streak > 7) {
    const weeksPast = Math.floor((streak - 1) / 7);
    const bonus = Math.min(50, weeksPast * 5);
    return { ...base, stardust: (base.stardust ?? 0) + bonus };
  }
  return base;
}

export async function claimDailyReward(): Promise<DailyClaimResult> {
  const callable = httpsCallable<unknown, DailyClaimResult>(functions, 'claimDailyReward');
  const res = await callable();
  return res.data;
}
