import { useEffect, useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { adsService } from '@/services/AdsService';
import { iapService } from '@/services/IapService';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

// Cost & ad reduction tunables
const CR_PER_MINUTE = 5;       // skip cost per remaining minute
const AD_SKIP_MS    = 30 * 60_000; // ad watch shaves 30 min off
const SKIP_PRODUCT_ID = 'reelwright_skip_build';
const SKIP_PRICE_FALLBACK = '$0.99';

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
  const credits = useGameStore((s) => s.credits);
  const subtractResources = useGameStore((s) => s.subtractResources);
  const grantResources    = useGameStore((s) => s.grantResources);
  const activeBuildJob = useHabitatStore((s) => s.activeBuildJob);
  const msUntilComplete = useHabitatStore((s) => s.msUntilComplete);
  const applyBuildSkip = useHabitatStore((s) => s.applyBuildSkip);

  const [busy, setBusy] = useState<'cr' | 'ad' | 'iap' | null>(null);
  const [iapPrice, setIapPrice] = useState(SKIP_PRICE_FALLBACK);

  useEffect(() => {
    if (!visible) return;
    void iapService.getLocalizedPrice(SKIP_PRODUCT_ID).then((p) => {
      if (p) setIapPrice(p);
    });
  }, [visible]);

  const minutesLeft = Math.ceil(msUntilComplete / 60_000);
  const skipCost    = Math.max(CR_PER_MINUTE, minutesLeft * CR_PER_MINUTE);
  const canAffordCr = credits >= skipCost;

  async function handleSpendCr() {
    if (!canAffordCr || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy('cr');
    try {
      const ok = subtractResources({ credits: skipCost });
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

  async function handleBuySkip() {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy('iap');
    try {
      const r = await iapService.purchase(SKIP_PRODUCT_ID);
      if (r.ok) {
        // Build-skip is a low-stakes purchase — applying client-side after a
        // successful purchase event is acceptable even with the webhook in
        // production. (Credit/spin packs go through the webhook for real
        // grant authority.)
        applyBuildSkip('instant');
        // Purely cosmetic: a tiny CR refund prevents "I just spent $0.99 to
        // skip a 1-min build" buyer's remorse if they slip.
        if (r.stubbed && minutesLeft <= 2) grantResources({ credits: 0 });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onClose();
      } else if (r.error && r.error !== 'cancelled') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
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
            <Text style={styles.subtitle}>{formatRemaining(msUntilComplete)} remaining</Text>
          </LinearGradient>

          <View style={styles.actions}>
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
                    {skipCost.toLocaleString()} CR  ·  INSTANT
                  </Text>
                  <Text style={styles.actionSub}>
                    {canAffordCr
                      ? `Skip remaining ${formatRemaining(msUntilComplete)}`
                      : `Need ${(skipCost - credits).toLocaleString()} more CR`}
                  </Text>
                </>
              )}
            </Pressable>

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

            <Pressable
              onPress={handleBuySkip}
              disabled={busy !== null}
              style={[styles.action, { borderColor: Colors.accent }]}
            >
              {busy === 'iap' ? (
                <ActivityIndicator color={Colors.accent} />
              ) : (
                <>
                  <Text style={[styles.actionLabel, { color: Colors.accent }]}>{iapPrice}  ·  INSTANT</Text>
                  <Text style={styles.actionSub}>Skip the entire timer</Text>
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
