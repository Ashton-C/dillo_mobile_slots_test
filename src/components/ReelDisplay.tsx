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
import { SlotSymbol, SpinResult, ReelWindow, WinLine, LINE_PATTERNS } from '@/services/SlotsEngine';
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
  highlightColor?: string | null;
  cellHeight?: number;
  symbolSize?: number;
}

function Reel({ symbol, isSpinning, isWinning, delayMs = 0, highlightColor, cellHeight = 100, symbolSize }: ReelProps) {
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
  const glowColor = highlightColor ?? symbolColor;
  const fontSize = symbolSize ?? (cellHeight >= 90 ? Typography.sizes.hero : Typography.sizes.xl);

  return (
    <View style={[styles.reelCell, { height: cellHeight }]}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: glowColor + '28' }, glowStyle]}
      />
      <Animated.View style={animatedStyle}>
        <Text style={[styles.symbol, { color: symbolColor, fontSize, lineHeight: fontSize + 8 }]}>
          {SYMBOL_GLYPHS[symbol]}
        </Text>
      </Animated.View>
    </View>
  );
}

interface Props {
  reels: [SlotSymbol, SlotSymbol, SlotSymbol];
  isSpinning: boolean;
  lastResult?: SpinResult | null;
  reelWindow?: ReelWindow | null;
  activeWinLines?: WinLine[] | null;
}

const WIN_COLORS: Record<string, string> = {
  JACKPOT: Colors.credits,
  TRIPLE:  Colors.primary,
  PAIR:    Colors.success,
};

function winLineColor(wl: WinLine): string {
  if (wl.result.creditsWon > 0)     return Colors.credits;
  if (wl.result.attacksWon > 0)     return Colors.attack;
  if (wl.result.raidsWon > 0)       return Colors.raid;
  if (wl.result.shieldsWon > 0)     return Colors.shield;
  if (wl.result.intrusionsWon > 0)  return Colors.danger;
  if (wl.result.extractionsWon > 0) return Colors.accent;
  return Colors.success;
}

export function ReelDisplay({ reels, isSpinning, lastResult, reelWindow, activeWinLines }: Props) {
  const trackScale = useSharedValue(1);
  const prevSpinningRef = useRef(isSpinning);

  // Single-row win detection (always based on middle row for label)
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

  // Multi-row win line badge
  const multiWinLabel = useMemo(() => {
    if (!activeWinLines || isSpinning) return '';
    if (activeWinLines.length === 0) return '';
    if (activeWinLines.some((wl) => wl.result.isJackpot)) return 'JACKPOT';
    if (activeWinLines.length > 1) return `${activeWinLines.length} LINES`;
    // Single win line — derive from result type
    const wl = activeWinLines[0];
    const [r0, r1, r2] = wl.result.reels;
    if (r0 === r1 && r1 === r2) return 'TRIPLE';
    return 'LINE WIN';
  }, [activeWinLines, isSpinning]);

  // Per-cell highlight colors for multi-row mode
  const cellHighlights = useMemo(() => {
    const h: (string | null)[][] = [[null, null, null], [null, null, null], [null, null, null]];
    if (!activeWinLines || isSpinning) return h;
    for (const wl of activeWinLines) {
      const pattern = LINE_PATTERNS[wl.id];
      const color = winLineColor(wl);
      for (let col = 0; col < 3; col++) {
        h[pattern[col]][col] = color;
      }
    }
    return h;
  }, [activeWinLines, isSpinning]);

  useEffect(() => {
    const hasWin = reelWindow
      ? (activeWinLines?.length ?? 0) > 0
      : winLabel !== '';
    if (!isSpinning && prevSpinningRef.current && hasWin) {
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

  // --- Multi-row rendering ---
  if (reelWindow) {
    const CELL_H = 62;
    const displayLabel = multiWinLabel;
    const displayColor = displayLabel === 'JACKPOT' ? Colors.credits
                       : displayLabel === 'TRIPLE'  ? Colors.primary
                       : Colors.success;

    return (
      <View style={styles.container}>
        <Animated.View style={[styles.track, styles.multiTrack, trackScaleStyle]}>
          {([0, 1, 2] as const).map((rowIdx) => (
            <View key={rowIdx}>
              {rowIdx > 0 && <View style={styles.hDivider} />}
              <View style={[styles.multiRow, rowIdx === 1 && styles.multiRowMid]}>
                {([0, 1, 2] as const).map((col) => (
                  <View key={col} style={styles.multiCellWrap}>
                    {col > 0 && <View style={styles.divider} />}
                    <Reel
                      symbol={reelWindow[rowIdx][col]}
                      isSpinning={isSpinning}
                      isWinning={cellHighlights[rowIdx][col] !== null}
                      highlightColor={cellHighlights[rowIdx][col]}
                      delayMs={col * 60 + rowIdx * 20}
                      cellHeight={CELL_H}
                      symbolSize={Typography.sizes.xl}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </Animated.View>
        {displayLabel !== '' && !isSpinning && (
          <View style={[styles.winBadge, { backgroundColor: displayColor }]}>
            <Text style={styles.winBadgeText}>{displayLabel}</Text>
          </View>
        )}
      </View>
    );
  }

  // --- Single-row rendering (original) ---
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
  multiTrack: {
    flexDirection: 'column',
  },
  multiRow: {
    flexDirection: 'row',
    width: '100%',
  },
  multiRowMid: {
    backgroundColor: Colors.surfaceElevated + '80',
  },
  multiCellWrap: {
    flex: 1,
    flexDirection: 'row',
  },
  hDivider: {
    height: 1,
    backgroundColor: Colors.border,
    width: '100%',
  },
  reelCell: {
    flex: 1,
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
