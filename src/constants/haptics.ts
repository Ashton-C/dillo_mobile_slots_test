import * as Haptics from 'expo-haptics';
import type { SpinResult } from '@/services/SlotsEngine';

export async function hapticForSpinResult(result: SpinResult): Promise<void> {
  if (result.isJackpot) {
    return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
  if (result.outcomeType === 'NOTHING') return;

  const [r0, r1, r2] = result.reels;
  const isTriple = r0 === r1 && r1 === r2;

  if (isTriple) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    return new Promise((resolve) =>
      setTimeout(() => resolve(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)), 150),
    );
  }

  return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticActivateBuff(): Promise<void> {
  return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

export function hapticBuildStart(): Promise<void> {
  return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticBuildComplete(): Promise<void> {
  return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function hapticCombatLaunch(): Promise<void> {
  return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

export function hapticCombatWin(): Promise<void> {
  return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function hapticCombatLoss(): Promise<void> {
  return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}

export function hapticLevelUp(): Promise<void> {
  return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}
