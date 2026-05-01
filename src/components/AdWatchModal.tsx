import { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { hapticBuildComplete } from '@/constants/haptics';

const AD_DURATION_MS = 8_000;

interface Props {
  visible: boolean;
  rewardLabel: string;
  onClose: () => void;
  onComplete: () => void;
}

export function AdWatchModal({ visible, rewardLabel, onClose, onComplete }: Props) {
  const [msLeft, setMsLeft] = useState(AD_DURATION_MS);
  const [phase, setPhase] = useState<'WATCHING' | 'COMPLETE'>('WATCHING');
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!visible) return;
    setPhase('WATCHING');
    setMsLeft(AD_DURATION_MS);
    const startedAt = Date.now();
    intervalRef.current = setInterval(() => {
      const remaining = AD_DURATION_MS - (Date.now() - startedAt);
      if (remaining <= 0) {
        setMsLeft(0);
        setPhase('COMPLETE');
        hapticBuildComplete();
        clearInterval(intervalRef.current);
      } else {
        setMsLeft(remaining);
      }
    }, 100);
    return () => clearInterval(intervalRef.current);
  }, [visible]);

  function handleClaim() {
    onComplete();
    onClose();
  }

  const secondsLeft = Math.ceil(msLeft / 1000);
  const progressPct = ((AD_DURATION_MS - msLeft) / AD_DURATION_MS) * 100;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.panel}>
          <Text style={styles.headerLabel}>SPONSORED</Text>

          {/* Mock ad surface */}
          <LinearGradient
            colors={[Colors.accent, Colors.gradientStart]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.adSurface}
          >
            <Text style={styles.adTitle}>STELLAR FORGE</Text>
            <Text style={styles.adSubtitle}>Mine cosmic rifts. Build empires.</Text>
            <Text style={styles.adCTA}>WISHLIST NOW ⬡</Text>
          </LinearGradient>

          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>

          <Text style={styles.statusLabel}>
            {phase === 'WATCHING' ? `Ad ends in ${secondsLeft}s` : 'Ad complete · reward unlocked'}
          </Text>

          <Text style={styles.rewardPreview}>REWARD  ·  {rewardLabel.toUpperCase()}</Text>

          {phase === 'WATCHING' ? (
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>CANCEL — FORFEIT REWARD</Text>
            </Pressable>
          ) : (
            <Pressable onPress={handleClaim} style={styles.claimBtn}>
              <Text style={styles.claimText}>CLAIM REWARD</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  panel: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  headerLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 4,
    textAlign: 'center',
  },
  adSurface: {
    aspectRatio: 16 / 9,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: 6,
  },
  adTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 4,
  },
  adSubtitle: {
    fontSize: Typography.sizes.xs,
    color: Colors.textPrimary + 'CC',
    letterSpacing: 1,
    textAlign: 'center',
  },
  adCTA: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 3,
    marginTop: Spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.textPrimary + '99',
  },
  progressTrack: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.success,
  },
  statusLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    letterSpacing: 2,
    textAlign: 'center',
  },
  rewardPreview: {
    fontSize: Typography.sizes.xs,
    color: Colors.credits,
    letterSpacing: 2,
    textAlign: 'center',
    fontWeight: Typography.weights.bold,
  },
  cancelBtn: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  claimBtn: {
    backgroundColor: Colors.success,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  claimText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.background,
    letterSpacing: 3,
  },
});
