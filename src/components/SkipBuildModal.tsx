import { useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { adsService } from '@/services/AdsService';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// Tunables
const CR_PER_MINUTE         = 5;       // CR cost per remaining minute
const STARDUST_PER_MIN      = 1;       // ✦ cost per remaining minute (buildings)
const OUTPOST_STARDUST_MULT = 2;       // outpost upgrades cost 2× per minute
const AD_SKIP_MS            = 30 * 60_000;

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'now';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export function SkipBuildModal({ visible, onClose }: Props) {
  const router = useRouter();
  const credits          = useGameStore((s) => s.credits);
  const stardust         = useGameStore((s) => s.stardust);
  const subtractResources = useGameStore((s) => s.subtractResources);
  const subtractStardust  = useGameStore((s) => s.subtractStardust);
  const activeBuildJob   = useHabitatStore((s) => s.activeBuildJob);
  const msUntilComplete  = useHabitatStore((s) => s.msUntilComplete);
  const applyBuildSkip   = useHabitatStore((s) => s.applyBuildSkip);

  const [busy, setBusy] = useState<'cr' | 'ad' | 'dust' | null>(null);

  const minutesLeft   = Math.max(1, Math.ceil(msUntilComplete / 60_000));
  const isOutpost     = activeBuildJob?.isOutpost === true;
  const dustPerMin    = STARDUST_PER_MIN * (isOutpost ? OUTPOST_STARDUST_MULT : 1);
  const dustCost      = minutesLeft * dustPerMin;
  const crCost        = Math.max(CR_PER_MINUTE, minutesLeft * CR_PER_MINUTE);
  const canAffordCr   = credits  >= crCost;
  const canAffordDust = stardust >= dustCost;

  async function handleSpendCr() {
    if (!canAffordCr || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy('cr');
    try {
      const ok = subtractResources({ credits: crCost });
      if (ok) {
        applyBuildSkip('instant');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onClose();
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleWatchAd() {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy('ad');
    try {
      const r = await adsService.showRewardedAd();
      if (r.rewarded) {
        applyBuildSkip(AD_SKIP_MS);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onClose();
      }
    } finally {
      setBusy(null);
    }
  }

  function handleSpendStardust() {
    if (busy) return;
    if (!canAffordDust) {
      // Send the user to the Store screen — they'll land in the STARDUST
      // section (it's the first section in store.tsx now) and can pick a
      // pack. We close the modal so the route transition is unimpeded.
      Haptics.selectionAsync().catch(() => {});
      onClose();
      router.push('/(tabs)/store');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy('dust');
    try {
      const ok = subtractStardust(dustCost);
      if (ok) {
        applyBuildSkip('instant');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onClose();
      }
    } finally {
      setBusy(null);
    }
  }

  if (!activeBuildJob) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <LinearGradient colors={[Colors.accent + '33', 'transparent']} style={styles.headerGrad}>
            <Text style={styles.title}>FINISH BUILD NOW</Text>
            <Text style={styles.subtitle}>{formatRemaining(msUntilComplete)} remaining{isOutpost ? '  ·  outpost upgrade' : ''}</Text>
          </LinearGradient>

          <View style={styles.actions}>
            {/* Stardust — primary action; replaces the old flat-IAP option */}
            <Pressable
              onPress={handleSpendStardust}
              disabled={busy !== null}
              style={[styles.action, { borderColor: canAffordDust ? Colors.warning : Colors.border }]}
            >
              {busy === 'dust' ? (
                <ActivityIndicator color={Colors.warning} />
              ) : canAffordDust ? (
                <>
                  <Text style={[styles.actionLabel, { color: Colors.warning }]}>
                    ✦ {dustCost.toLocaleString()}  ·  INSTANT
                  </Text>
                  <Text style={styles.actionSub}>
                    Skip remaining {formatRemaining(msUntilComplete)}
                    {isOutpost ? ' (outpost rate)' : ''}
                  </Text>
                </>
              ) : (
                <>
                  <Text style={[styles.actionLabel, { color: Colors.warning }]}>
                    BUY STARDUST  ▸
                  </Text>
                  <Text style={styles.actionSub}>
                    Need {(dustCost - stardust).toLocaleString()} more ✦ to skip
                  </Text>
                </>
              )}
            </Pressable>

            {/* Credits — alternative payment for whales who hoard CR */}
            <Pressable
              onPress={handleSpendCr}
              disabled={!canAffordCr || busy !== null}
              style={[styles.action, { borderColor: canAffordCr ? Colors.credits : Colors.border }]}
            >
              {busy === 'cr' ? (
                <ActivityIndicator color={Colors.credits} />
              ) : (
                <>
                  <Text style={[styles.actionLabel, { color: canAffordCr ? Colors.credits : Colors.textMuted }]}>
                    {crCost.toLocaleString()} CR
                  </Text>
                  <Text style={styles.actionSub}>
                    {canAffordCr
                      ? `Skip with credits instead`
                      : `Need ${(crCost - credits).toLocaleString()} more CR`}
                  </Text>
                </>
              )}
            </Pressable>

            {/* Rewarded ad — F2P drip, shaves 30 min */}
            <Pressable
              onPress={handleWatchAd}
              disabled={busy !== null}
              style={[styles.action, { borderColor: Colors.success }]}
            >
              {busy === 'ad' ? (
                <ActivityIndicator color={Colors.success} />
              ) : (
                <>
                  <Text style={[styles.actionLabel, { color: Colors.success }]}>▶  WATCH AD</Text>
                  <Text style={styles.actionSub}>Skip 30 minutes off the timer</Text>
                </>
              )}
            </Pressable>

            <Pressable onPress={onClose} disabled={busy !== null} style={[styles.action, styles.actionGhost]}>
              <Text style={[styles.actionLabel, { color: Colors.textSecondary }]}>WAIT</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    width: '88%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  headerGrad: {
    padding: Spacing.lg,
    alignItems: 'center',
    gap: 4,
  },
  title: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.accent,
    letterSpacing: 3,
  },
  subtitle: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  actions: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  action: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    gap: 2,
  },
  actionGhost: {
    borderColor: Colors.border,
  },
  actionLabel: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  actionSub: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
});
