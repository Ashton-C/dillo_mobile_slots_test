import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useGameStore } from '@/store/useGameStore';
import { useAuthStore } from '@/store/useAuthStore';
import { SpinButton } from '@/components/SpinButton';
import { ReelDisplay } from '@/components/ReelDisplay';
import { ResourceBar } from '@/components/ResourceBar';
import { RiftSelector } from '@/components/RiftSelector';
import { ModifierPanel } from '@/components/ModifierPanel';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { TemporalRiftTier } from '@/services/SlotsEngine';

const EMPTY_REELS: ['EMPTY', 'EMPTY', 'EMPTY'] = ['EMPTY', 'EMPTY', 'EMPTY'];
const MAX_SPINS = 50;
const LOW_SPIN_THRESHOLD = 5;

function formatRefillTimer(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SpinScreen() {
  const {
    credits, attacks, raids, shields, spinsRemaining,
    isSpinning, lastResult, riftTier,
    msUntilNextSpin, msUntilFull,
    overclockActive, signalBoostActive,
    spin, setRiftTier, activateOverclock, activateSignalBoost,
  } = useGameStore();

  const { displayName } = useAuthStore();

  // Jackpot flash
  const flashOpacity = useSharedValue(0);
  const prevJackpot = useRef(false);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  useEffect(() => {
    const isJackpot = lastResult?.isJackpot ?? false;
    if (isJackpot && !prevJackpot.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      flashOpacity.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 280 }),
        withTiming(0.7, { duration: 60 }),
        withTiming(0, { duration: 400 }),
      );
    }
    prevJackpot.current = isJackpot;
  }, [lastResult]);

  const reels = lastResult?.reels ?? EMPTY_REELS;
  const canSpin = spinsRemaining > 0 && !isSpinning;
  const showQuickActions = attacks > 0 || raids > 0 || overclockActive || signalBoostActive;
  const spinsLow = spinsRemaining <= LOW_SPIN_THRESHOLD;

  return (
    <SafeAreaView style={styles.root}>

      {/* Jackpot screen flash */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.jackpotFlash, flashStyle]}
      />

      {/* Gradient header — pilot badge + resource bar */}
      <LinearGradient
        colors={[Colors.gradientStart + '55', Colors.gradientMid + '33', Colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        {displayName && (
          <Text style={styles.pilotBadge}>◎ {displayName}</Text>
        )}
        <ResourceBar
          credits={credits}
          attacks={attacks}
          raids={raids}
          shields={shields}
          spinsRemaining={spinsRemaining}
          style={styles.resourceBarTransparent}
        />
      </LinearGradient>

      <ModifierPanel />

      <View style={styles.content}>
        {/* Outcome banner */}
        <View style={styles.outcomeBanner}>
          {lastResult && lastResult.outcomeType !== 'NOTHING' ? (
            <Text style={styles.outcomeText}>{outcomeMessage(lastResult)}</Text>
          ) : (
            <Text style={styles.outcomeTextMuted}>
              {spinsRemaining > 0 ? 'Awaiting spin…' : 'No spins left'}
            </Text>
          )}
          {lastResult?.isJackpot && (
            <Text style={styles.jackpotBadge}>JACKPOT</Text>
          )}
        </View>

        <ReelDisplay reels={reels} isSpinning={isSpinning} />

        <View style={styles.spinZone}>
          <SpinButton onPress={spin} disabled={!canSpin} isSpinning={isSpinning} />
          <Text style={[styles.spinsLabel, spinsLow && styles.spinsLabelLow]}>
            {spinsRemaining} / {MAX_SPINS} spins
          </Text>
          {spinsRemaining < MAX_SPINS && msUntilNextSpin > 0 && (
            <View style={styles.refillRow}>
              <Text style={[styles.refillNext, spinsLow && styles.refillNextLow]}>
                NEXT SPIN  {formatRefillTimer(msUntilNextSpin)}
              </Text>
              {spinsRemaining < MAX_SPINS - 1 && (
                <Text style={styles.refillFull}>
                  FULL  {formatRefillTimer(msUntilFull)}
                </Text>
              )}
            </View>
          )}
        </View>

        {showQuickActions && (
          <View style={styles.quickActions}>
            {(attacks > 0 || overclockActive) && (
              <Pressable
                onPress={activateOverclock}
                disabled={overclockActive}
                style={[styles.quickButton, overclockActive && styles.quickButtonActive]}
              >
                <Text style={[styles.quickButtonLabel, overclockActive && styles.quickButtonLabelActive]}>
                  {overclockActive ? '⚡ OVERCLOCK  ACTIVE' : `⚡ OVERCLOCK  ${attacks} FUEL`}
                </Text>
                <Text style={styles.quickButtonSub}>
                  {overclockActive ? 'Bonus lands on next spin' : '+CR bonus next spin'}
                </Text>
              </Pressable>
            )}
            {(raids > 0 || signalBoostActive) && (
              <Pressable
                onPress={activateSignalBoost}
                disabled={signalBoostActive}
                style={[styles.quickButton, signalBoostActive && styles.quickButtonActive]}
              >
                <Text style={[styles.quickButtonLabel, signalBoostActive && styles.quickButtonLabelActive]}>
                  {signalBoostActive ? '◈ BOOST  ACTIVE' : `◈ BOOST  ${raids} SIGNAL`}
                </Text>
                <Text style={styles.quickButtonSub}>Credit weights ×1.5</Text>
              </Pressable>
            )}
          </View>
        )}

        <RiftSelector
          currentTier={riftTier}
          availableCredits={credits}
          onSelect={(tier: TemporalRiftTier) => setRiftTier(tier)}
        />
      </View>
    </SafeAreaView>
  );
}

function outcomeMessage(result: NonNullable<ReturnType<typeof useGameStore.getState>['lastResult']>): string {
  switch (result.outcomeType) {
    case 'CREDITS': return `+${result.creditsWon.toLocaleString()} CREDITS`;
    case 'ATTACK': return `+${result.attacksWon} FUEL CELL${result.attacksWon !== 1 ? 'S' : ''}`;
    case 'RAID': return `+${result.raidsWon} SIGNAL BOOSTER${result.raidsWon !== 1 ? 'S' : ''}`;
    case 'SHIELD': return `+${result.shieldsWon} SHIELD${result.shieldsWon !== 1 ? 'S' : ''}`;
    default: return '';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  jackpotFlash: {
    backgroundColor: Colors.credits + '66',
    zIndex: 99,
  },

  pilotBadge: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    letterSpacing: 2,
    textAlign: 'right',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: 2,
  },
  resourceBarTransparent: {
    backgroundColor: 'transparent',
    borderBottomColor: Colors.border + '55',
  },

  content: { flex: 1, paddingTop: Spacing.md, gap: Spacing.lg },

  outcomeBanner: {
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.md,
  },
  outcomeText: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
    letterSpacing: 3,
  },
  outcomeTextMuted: {
    fontSize: Typography.sizes.md,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  jackpotBadge: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.background,
    backgroundColor: Colors.credits,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
    letterSpacing: 3,
    marginTop: Spacing.xs,
  },

  spinZone: { alignItems: 'center', gap: Spacing.sm },
  spinsLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  spinsLabelLow: {
    color: Colors.warning,
    fontWeight: Typography.weights.bold,
  },
  refillRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    alignItems: 'center',
  },
  refillNext: {
    fontSize: Typography.sizes.xs,
    color: Colors.accent,
    letterSpacing: 1,
    fontWeight: Typography.weights.bold,
  },
  refillNextLow: {
    color: Colors.warning,
  },
  refillFull: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },

  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  quickButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surfaceElevated,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  quickButtonActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
  },
  quickButtonLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  quickButtonLabelActive: {
    color: Colors.primary,
  },
  quickButtonSub: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },
});
