import { useEffect, useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useGameStore } from '@/store/useGameStore';
import { adsService } from '@/services/AdsService';
import { iapService } from '@/services/IapService';
import { PACKS, AD_REWARDS, getAdReadyAt, markAdClaimed } from '@/services/StoreService';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const REFILL_PACK = PACKS.find((p) => p.id === 'sp_refill')!;
const SPIN_AD     = AD_REWARDS.find((a) => a.id === 'ad_spins')!;

function formatMs(ms: number): string {
  if (ms <= 0) return 'now';
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export function SpinRefillModal({ visible, onClose }: Props) {
  const grantResources = useGameStore((s) => s.grantResources);
  const msUntilNextSpin = useGameStore((s) => s.msUntilNextSpin);

  const [adReadyAt, setAdReadyAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState<'ad' | 'iap' | null>(null);

  useEffect(() => {
    if (!visible) return;
    getAdReadyAt(SPIN_AD.id).then(setAdReadyAt);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [visible]);

  const adReadyMs = Math.max(0, adReadyAt - now);
  const adReady   = adReadyMs <= 0;

  async function handleWatchAd() {
    if (!adReady || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy('ad');
    try {
      const r = await adsService.showRewardedAd();
      if (r.rewarded) {
        grantResources(SPIN_AD.reward);
        await markAdClaimed(SPIN_AD.id, SPIN_AD.cooldownMs);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onClose();
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleBuyRefill() {
    if (busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setBusy('iap');
    try {
      const r = await iapService.purchase(REFILL_PACK.id);
      if (r.ok) {
        // Stub mode (Expo Go / no key configured) — apply rewards locally so
        // dev flow still works. With real RC + webhook configured, the
        // server is the source of truth and Firestore sync will update us.
        if (r.stubbed) grantResources(REFILL_PACK.rewards);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onClose();
      } else if (r.error && r.error !== 'cancelled') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <LinearGradient colors={[Colors.warning + '33', 'transparent']} style={styles.headerGrad}>
            <Text style={styles.title}>SPIN TANK EMPTY</Text>
            <Text style={styles.subtitle}>Refill in {formatMs(msUntilNextSpin)} · or skip the wait</Text>
          </LinearGradient>

          <View style={styles.actions}>
            <Pressable
              onPress={handleWatchAd}
              disabled={!adReady || busy !== null}
              style={[styles.action, { borderColor: adReady ? Colors.success : Colors.border }]}
            >
              {busy === 'ad' ? (
                <ActivityIndicator color={Colors.success} />
              ) : (
                <>
                  <Text style={[styles.actionLabel, { color: adReady ? Colors.success : Colors.textMuted }]}>
                    ▶  WATCH AD
                  </Text>
                  <Text style={styles.actionSub}>
                    {adReady ? 'Refills the spin tank' : `Cooldown ${formatMs(adReadyMs)}`}
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              onPress={handleBuyRefill}
              disabled={busy !== null}
              style={[styles.action, { borderColor: Colors.credits }]}
            >
              {busy === 'iap' ? (
                <ActivityIndicator color={Colors.credits} />
              ) : (
                <>
                  <Text style={[styles.actionLabel, { color: Colors.credits }]}>
                    {REFILL_PACK.price}  ·  REFILL
                  </Text>
                  <Text style={styles.actionSub}>Instant top-up to max spins</Text>
                </>
              )}
            </Pressable>

            <Pressable
              onPress={onClose}
              disabled={busy !== null}
              style={[styles.action, styles.actionGhost]}
            >
              <Text style={[styles.actionLabel, { color: Colors.textSecondary }]}>WAIT</Text>
              <Text style={styles.actionSub}>Next spin in {formatMs(msUntilNextSpin)}</Text>
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
    color: Colors.warning,
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
