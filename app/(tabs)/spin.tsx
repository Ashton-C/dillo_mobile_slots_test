import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticForSpinResult, hapticActivateBuff, hapticLevelUp } from '@/constants/haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { useGameStore } from '@/store/useGameStore';
import { useAuthStore } from '@/store/useAuthStore';
import { SpinButton } from '@/components/SpinButton';
import { ReelDisplay } from '@/components/ReelDisplay';
import { ResourceBar } from '@/components/ResourceBar';
import { RiftSelector } from '@/components/RiftSelector';
import { ModifierPanel } from '@/components/ModifierPanel';
import { JackpotBurst } from '@/components/JackpotBurst';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { TemporalRiftTier } from '@/services/SlotsEngine';

const EMPTY_REELS: ['EMPTY', 'EMPTY', 'EMPTY'] = ['EMPTY', 'EMPTY', 'EMPTY'];
const MAX_SPINS = 50;
const LOW_SPIN_THRESHOLD = 5;
const MILESTONES = [250, 500, 1000, 2500, 5000, 10_000, 25_000, 50_000];

function formatRefillTimer(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getMilestone(credits: number): { next: number; progress: number } {
  const nextIdx = MILESTONES.findIndex((m) => m > credits);
  if (nextIdx === -1) return { next: MILESTONES[MILESTONES.length - 1], progress: 1 };
  const next = MILESTONES[nextIdx];
  const prev = nextIdx > 0 ? MILESTONES[nextIdx - 1] : 0;
  return { next, progress: Math.min(1, Math.max(0, (credits - prev) / (next - prev))) };
}

export default function SpinScreen() {
  const {
    credits, attacks, raids, shields, intrusions, extractions, spinsRemaining,
    isSpinning, lastResult, riftTier, level,
    msUntilNextSpin, msUntilFull,
    overclockActive, signalBoostActive,
    spin, setRiftTier, activateOverclock, activateSignalBoost,
  } = useGameStore();

  const { displayName } = useAuthStore();

  const [burstVisible, setBurstVisible] = useState(false);
  const burstTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const flashOpacity = useSharedValue(0);
  const prevJackpot = useRef(false);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  useEffect(() => {
    const isJackpot = lastResult?.isJackpot ?? false;
    if (isJackpot && !prevJackpot.current) {
      hapticForSpinResult(lastResult!);
      flashOpacity.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 280 }),
        withTiming(0.7, { duration: 60 }),
        withTiming(0, { duration: 400 }),
      );
      setBurstVisible(true);
      burstTimerRef.current = setTimeout(() => setBurstVisible(false), 1000);
    }
    prevJackpot.current = isJackpot;
    return () => clearTimeout(burstTimerRef.current);
  }, [lastResult]);

  const bannerScale = useSharedValue(1);
  useEffect(() => {
    if (lastResult && lastResult.outcomeType !== 'NOTHING') {
      if (!lastResult.isJackpot) hapticForSpinResult(lastResult);
      bannerScale.value = withSequence(
        withTiming(1.08, { duration: 90 }),
        withSpring(1, { damping: 10, stiffness: 150 }),
      );
    }
  }, [lastResult]);
  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bannerScale.value }],
  }));

  const levelFlash = useSharedValue(0);
  const prevLevel = useRef(level);
  const levelFlashStyle = useAnimatedStyle(() => ({ opacity: levelFlash.value }));

  useEffect(() => {
    if (level > prevLevel.current) {
      hapticLevelUp();
      levelFlash.value = withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0.6, { duration: 120 }),
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 500 }),
      );
    }
    prevLevel.current = level;
  }, [level]);

  const reels = lastResult?.reels ?? EMPTY_REELS;
  const canSpin = spinsRemaining > 0 && !isSpinning;
  const showQuickActions = attacks > 0 || raids > 0 || overclockActive || signalBoostActive;
  const showCombatResources = intrusions > 0 || extractions > 0;
  const spinsLow = spinsRemaining <= LOW_SPIN_THRESHOLD;
  const milestone = useMemo(() => getMilestone(credits), [credits]);

  return (
    <SafeAreaView style={styles.root}>

      {/* Jackpot screen flash */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.jackpotFlash, flashStyle]}
      />

      {/* Level-up overlay */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.levelUpFlash, levelFlashStyle]}
      />

      {/* Jackpot particle burst — centered over reel area */}
      <JackpotBurst visible={burstVisible} />

      {/* Gradient header */}
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
        <Animated.View style={[styles.outcomeBanner, bannerStyle]}>
          {lastResult && lastResult.outcomeType !== 'NOTHING' ? (
            <Text style={styles.outcomeText}>{outcomeMessage(lastResult)}</Text>
          ) : (
            <Text style={styles.outcomeTextMuted}>
              {spinsRemaining > 0 ? 'Awaiting spin…' : 'No spins left'}
            </Text>
          )}
        </Animated.View>

        {/* Credit milestone bar */}
        <View style={styles.milestoneContainer}>
          <View style={styles.milestoneTrack}>
            <View style={[styles.milestoneFill, { width: `${milestone.progress * 100}%` }]} />
          </View>
          <Text style={styles.milestoneLabel}>{milestone.next.toLocaleString()} CR</Text>
        </View>

        <ReelDisplay reels={reels} isSpinning={isSpinning} lastResult={lastResult} />

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
                onPress={() => { activateOverclock(); hapticActivateBuff(); }}
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
                onPress={() => { activateSignalBoost(); hapticActivateBuff(); }}
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

        {showCombatResources && (
          <View style={styles.combatRow}>
            {intrusions > 0 && (
              <View style={[styles.combatChip, { borderColor: Colors.danger }]}>
                <Text style={[styles.combatChipText, { color: Colors.danger }]}>⚔  {intrusions} BREACH KEY{intrusions !== 1 ? 'S' : ''}</Text>
              </View>
            )}
            {extractions > 0 && (
              <View style={[styles.combatChip, { borderColor: Colors.accent }]}>
                <Text style={[styles.combatChipText, { color: Colors.accent }]}>⛏  {extractions} BEAM{extractions !== 1 ? 'S' : ''}</Text>
              </View>
            )}
            <Text style={styles.combatHint}>→ RADAR</Text>
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
    case 'CREDITS':    return `+${result.creditsWon.toLocaleString()} CREDITS`;
    case 'ATTACK':     return `+${result.attacksWon} FUEL CELL${result.attacksWon !== 1 ? 'S' : ''}`;
    case 'RAID':       return `+${result.raidsWon} SIGNAL BOOSTER${result.raidsWon !== 1 ? 'S' : ''}`;
    case 'SHIELD':     return `+${result.shieldsWon} SHIELD${result.shieldsWon !== 1 ? 'S' : ''}`;
    case 'INTRUSION':  return `+${result.intrusionsWon} BREACH KEY${result.intrusionsWon !== 1 ? 'S' : ''}`;
    case 'EXTRACTION': return `+${result.extractionsWon} EXTRACTION BEAM${result.extractionsWon !== 1 ? 'S' : ''}`;
    default: return '';
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  jackpotFlash: {
    backgroundColor: Colors.credits + '66',
    zIndex: 99,
  },
  levelUpFlash: {
    backgroundColor: Colors.accent + '44',
    zIndex: 98,
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

  content: { flex: 1, paddingTop: Spacing.sm, gap: Spacing.md },

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
  milestoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  milestoneTrack: {
    flex: 1,
    height: 3,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  milestoneFill: {
    height: '100%',
    backgroundColor: Colors.credits + 'AA',
    borderRadius: 2,
  },
  milestoneLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 1,
    minWidth: 52,
    textAlign: 'right',
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

  combatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  combatChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  combatChipText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  combatHint: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginLeft: Spacing.xs,
  },
});
