import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { useEffect, useMemo, useRef } from 'react';
import { SlotSymbol, SpinResult } from '@/services/SlotsEngine';
import { Colors, BorderRadius, Typography } from '@/constants/theme';

const SYMBOL_GLYPHS: Record<SlotSymbol, string> = {
  CREDIT_SMALL:  '◈',
  CREDIT_MEDIUM: '◈◈',
  CREDIT_LARGE:  '◈◈◈',
  ATTACK:        '⚡',
  RAID:          '▲▲',
  SHIELD:        '◉',
  INTRUSION:     '⚔',
  EXTRACTION:    '⛏',
  EMPTY:         '·',
};

const SYMBOL_COLORS: Record<SlotSymbol, string> = {
  CREDIT_SMALL:  Colors.credits,
  CREDIT_MEDIUM: Colors.credits,
  CREDIT_LARGE:  Colors.credits,
  ATTACK:        Colors.attack,
  RAID:          Colors.raid,
  SHIELD:        Colors.shield,
  INTRUSION:     Colors.danger,
  EXTRACTION:    Colors.accent,
  EMPTY:         Colors.textMuted,
};

interface ReelProps {
  symbol: SlotSymbol;
  isSpinning: boolean;
  isWinning: boolean;
  delayMs?: number;
}

function Reel({ symbol, isSpinning, isWinning, delayMs = 0 }: ReelProps) {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);
  const glowOp = useSharedValue(0);

  useEffect(() => {
    if (isSpinning) {
      opacity.value = 0.4;
      glowOp.value = 0;
      translateY.value = withDelay(
        delayMs,
        withRepeat(withTiming(-8, { duration: 120, easing: Easing.linear }), -1, true),
      );
    } else if (isWinning) {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 150 });
      glowOp.value = withSequence(
        withTiming(1, { duration: 180 }),
        withTiming(0.45, { duration: 500 }),
        withTiming(0.85, { duration: 280 }),
        withTiming(0, { duration: 650 }),
      );
    } else {
      opacity.value = withTiming(1, { duration: 200 });
      translateY.value = withTiming(0, { duration: 150 });
      glowOp.value = withTiming(0, { duration: 200 });
    }
  }, [isSpinning, isWinning]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({ opacity: glowOp.value }));
  const symbolColor = SYMBOL_COLORS[symbol];

  return (
    <View style={styles.reelCell}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: symbolColor + '28' }, glowStyle]}
      />
      <Animated.View style={animatedStyle}>
        <Text style={[styles.symbol, { color: symbolColor }]}>{SYMBOL_GLYPHS[symbol]}</Text>
      </Animated.View>
    </View>
  );
}

interface Props {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol];
  isSpinning: boolean;
  lastResult?: SpinResult | null;
}

const WIN_COLORS: Record<string, string> = {
  JACKPOT: Colors.credits,
  TRIPLE:  Colors.primary,
  PAIR:    Colors.success,
};

export function ReelDisplay({ reels, isSpinning, lastResult }: Props) {
  const trackScale = useSharedValue(1);
  const prevSpinningRef = useRef(isSpinning);

  const { reelWins, winLabel, winColor } = useMemo(() => {
    const isPaid = !isSpinning && !!lastResult && lastResult.outcomeType !== 'NOTHING';
    const [r0, r1, r2] = reels;
    const isTriple = isPaid && r0 === r1 && r1 === r2;
    const isPair   = isPaid && !isTriple && (r0 === r1 || r1 === r2 || r0 === r2);
    const wins: [boolean, boolean, boolean] = isPaid
      ? [r0 === r1 || r0 === r2, r0 === r1 || r1 === r2, r1 === r2 || r0 === r2]
      : [false, false, false];
    let label = '';
    if (lastResult?.isJackpot) label = 'JACKPOT';
    else if (isTriple)         label = 'TRIPLE';
    else if (isPair)           label = 'PAIR';
    return { reelWins: wins, winLabel: label, winColor: WIN_COLORS[label] ?? Colors.success };
  }, [reels, lastResult, isSpinning]);

  useEffect(() => {
    if (!isSpinning && prevSpinningRef.current && winLabel !== '') {
      trackScale.value = withSequence(
        withSpring(1.05, { damping: 8, stiffness: 200 }),
        withTiming(1, { duration: 300 }),
      );
    }
    prevSpinningRef.current = isSpinning;
  }, [isSpinning]);

  const trackScaleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: trackScale.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.track, trackScaleStyle]}>
        <Reel symbol={reels[0]} isSpinning={isSpinning} isWinning={reelWins[0]} delayMs={0} />
        <View style={styles.divider} />
        <Reel symbol={reels[1]} isSpinning={isSpinning} isWinning={reelWins[1]} delayMs={80} />
        <View style={styles.divider} />
        <Reel symbol={reels[2]} isSpinning={isSpinning} isWinning={reelWins[2]} delayMs={160} />
      </Animated.View>
      {winLabel !== '' && !isSpinning && (
        <View style={[styles.winBadge, { backgroundColor: winColor }]}>
          <Text style={styles.winBadgeText}>{winLabel}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  track: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    width: '100%',
  },
  reelCell: {
    flex: 1,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  symbol: {
    fontSize: Typography.sizes.hero,
    lineHeight: 56,
  },
  divider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  winBadge: {
    position: 'absolute',
    bottom: -13,
    paddingHorizontal: 14,
    paddingVertical: 3,
    borderRadius: 99,
  },
  winBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.background,
    letterSpacing: 2,
  },
});
