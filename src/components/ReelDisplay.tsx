import { View, Text, StyleSheet, Dimensions, Image } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SlotSymbol, SpinResult, ReelWindow, WinLine, WinLineId, LINE_PATTERNS } from '@/services/SlotsEngine';
import {
  SYMBOL_PACK_GLYPHS,
  REEL_THEME_TOKENS,
  REEL_THEME_IMAGE_MAP,
  ReelThemeTokens,
  SymbolGlyph,
  SymbolGlyphs,
} from '@/services/CosmeticsService';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
import { useHabitatStore, getGridConfig } from '@/store/useHabitatStore';
import { soundService, SoundKey } from '@/services/SoundService';
import { Colors, BorderRadius, Typography } from '@/constants/theme';


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

const ALL_SYMBOLS: SlotSymbol[] = [
  'CREDIT_SMALL', 'CREDIT_MEDIUM', 'CREDIT_LARGE',
  'ATTACK', 'RAID', 'SHIELD', 'INTRUSION', 'EXTRACTION', 'EMPTY',
];

function randomSymbol(): SlotSymbol {
  return ALL_SYMBOLS[Math.floor(Math.random() * ALL_SYMBOLS.length)];
}

interface ReelColumnProps {
  // Symbols that should land in each visible row (top→bottom).
  targetSymbols: SlotSymbol[];
  isSpinning: boolean;
  colIndex: number;
  cellHeight: number;
  symbolSize: number;
  glyphs: SymbolGlyphs;
  cellBg: string;
  borderColor: string;
  // Per-row win highlight color (null = no highlight on that row).
  cellHighlights: (string | null)[];
  // Optional middle-row background tint (3x3 mid row, 5x5 center row).
  midRowBg?: string;
  // Whether to draw 1px horizontal dividers between rows.
  showHDividers: boolean;
  // Whether to draw a 1px vertical divider on the LEFT edge (for col > 0).
  showLeftDivider: boolean;
}

function isImageGlyph(g: SymbolGlyph): boolean {
  return typeof g !== 'string';
}

interface GlyphViewProps {
  glyph: SymbolGlyph;
  color: string;
  fontSize: number;
  animated?: boolean;
  animatedStyle?: any;
}

function GlyphView({ glyph, color, fontSize, animated, animatedStyle }: GlyphViewProps) {
  if (isImageGlyph(glyph)) {
    const size = Math.round(fontSize * 1.25);
    if (animated) {
      return (
        <Animated.Image
          source={glyph as any}
          style={[{ width: size, height: size }, animatedStyle]}
          resizeMode="contain"
        />
      );
    }
    return (
      <Image source={glyph as any} style={{ width: size, height: size }} resizeMode="contain" />
    );
  }
  if (animated) {
    return (
      <Animated.Text style={[styles.symbol, { color, fontSize, lineHeight: fontSize + 8 }, animatedStyle]}>
        {glyph as string}
      </Animated.Text>
    );
  }
  return (
    <Text style={[styles.symbol, { color, fontSize, lineHeight: fontSize + 8 }]}>
      {glyph as string}
    </Text>
  );
}

// Each column is one continuous scrolling strip that spans every visible row.
// Symbols flow through the entire window from top to bottom while the strip
// translates upward; the last `numRows` cells of the strip are the target
// landing symbols. Single withTiming + cubic-out easing gives the buttery
// slot-machine feel (fast at start, soft deceleration into the landing).
//
// Total duration per column = COL_DURATION_MS, with each column starting
// COL_STAGGER_MS later than the previous. For SPIN_ANIM_MS=2200ms the last
// column (5x5 = col 4) lands around 2040ms, leaving 160ms for the result
// reveal.
const STRIP_PAD = 28;
const COL_STAGGER_MS = 160;
const COL_DURATION_MS = 1400;

function ReelColumn({
  targetSymbols,
  isSpinning,
  colIndex,
  cellHeight,
  symbolSize,
  glyphs,
  cellBg,
  borderColor,
  cellHighlights,
  midRowBg,
  showHDividers,
  showLeftDivider,
}: ReelColumnProps) {
  const numRows = targetSymbols.length;
  const stripLen = STRIP_PAD + numRows;
  const finalY = -(STRIP_PAD * cellHeight);

  const stripRef = useRef<SlotSymbol[]>(
    Array.from({ length: stripLen }, (_, i) => targetSymbols[Math.max(0, i - STRIP_PAD)] ?? targetSymbols[0])
  );
  const [, forceUpdate] = useState(0);

  const translateY = useSharedValue(finalY);
  const winGlow    = useSharedValue(0);
  const winPop     = useSharedValue(1);

  const playLandSound = () => {
    void soundService.play((`reelStop${colIndex}` as SoundKey));
  };

  // Spin / land animation
  useEffect(() => {
    if (isSpinning) {
      // Build a fresh strip: random cells first, then the target symbols at the bottom.
      const strip: SlotSymbol[] = [];
      for (let i = 0; i < STRIP_PAD; i++) strip.push(randomSymbol());
      for (const s of targetSymbols) strip.push(s);
      stripRef.current = strip;
      forceUpdate((n) => n + 1);

      cancelAnimation(translateY);
      translateY.value = 0;
      winGlow.value = 0;

      const startDelay = colIndex * COL_STAGGER_MS;

      translateY.value = withDelay(
        startDelay,
        withTiming(
          finalY,
          { duration: COL_DURATION_MS, easing: Easing.out(Easing.cubic) },
          (finished) => {
            if (finished) {
              // Soft "clunk": a small overshoot past the landing, then spring back.
              translateY.value = withSequence(
                withTiming(finalY - 6, { duration: 90, easing: Easing.out(Easing.quad) }),
                withSpring(finalY, { damping: 14, stiffness: 280 }),
              );
              runOnJS(playLandSound)();
            }
          },
        ),
      );
    } else {
      // Snap to landed position with the target symbols.
      const strip: SlotSymbol[] = [];
      for (let i = 0; i < STRIP_PAD; i++) strip.push(targetSymbols[0]);
      for (const s of targetSymbols) strip.push(s);
      stripRef.current = strip;
      forceUpdate((n) => n + 1);
      cancelAnimation(translateY);
      translateY.value = finalY;
    }
  }, [isSpinning]);

  // Win highlight pulse — independent of spin, fires when a row wins.
  const hasAnyWin = cellHighlights.some((c) => c !== null);
  useEffect(() => {
    if (!isSpinning && hasAnyWin) {
      winGlow.value = withSequence(
        withTiming(1,    { duration: 180 }),
        withTiming(0.45, { duration: 500 }),
        withTiming(0.85, { duration: 280 }),
        withTiming(0,    { duration: 650 }),
      );
      winPop.value = 1;
      winPop.value = withSequence(
        withSpring(1.18, { damping: 6, stiffness: 260 }),
        withTiming(1, { duration: 320 }),
      );
    } else if (isSpinning) {
      winGlow.value = 0;
      winPop.value = 1;
    }
  }, [isSpinning, hasAnyWin]);

  const stripStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: winGlow.value }));
  const popStyle  = useAnimatedStyle(() => ({ transform: [{ scale: winPop.value }] }));

  const containerH = numRows * cellHeight + (showHDividers ? Math.max(0, numRows - 1) : 0);
  const midRowIdx = Math.floor(numRows / 2);

  return (
    <View style={{ flex: 1, height: containerH, backgroundColor: cellBg, overflow: 'hidden' }}>
      {/* Vertical divider on the left edge for non-leftmost columns */}
      {showLeftDivider && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 1,
            backgroundColor: borderColor + '66',
            zIndex: 5,
          }}
        />
      )}

      {/* Mid-row background tint — sits behind the scrolling strip */}
      {midRowBg && numRows > 1 && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: midRowIdx * cellHeight + (showHDividers ? midRowIdx : 0),
            height: cellHeight,
            backgroundColor: midRowBg,
          }}
        />
      )}

      {/* Per-row win glow overlays — pulse on win, sit behind the strip */}
      {cellHighlights.map((color, rowIdx) =>
        color ? (
          <Animated.View
            key={`hl${rowIdx}`}
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                right: 0,
                top: rowIdx * cellHeight + (showHDividers ? rowIdx : 0),
                height: cellHeight,
                backgroundColor: color + '28',
              },
              glowStyle,
            ]}
          />
        ) : null,
      )}

      {/* The scrolling strip — single continuous Animated.View carries every glyph */}
      <Animated.View pointerEvents="none" style={[{ width: '100%' }, stripStyle]}>
        {stripRef.current.map((sym, i) => {
          const visibleRowIdx = i - STRIP_PAD;
          const inLandedWindow = visibleRowIdx >= 0 && visibleRowIdx < numRows;
          const isHighlightedRow = inLandedWindow && cellHighlights[visibleRowIdx] !== null;
          return (
            <View key={i} style={{ height: cellHeight, alignItems: 'center', justifyContent: 'center' }}>
              <GlyphView
                glyph={glyphs[sym]}
                color={SYMBOL_COLORS[sym]}
                fontSize={symbolSize}
                animated={isHighlightedRow}
                animatedStyle={popStyle}
              />
            </View>
          );
        })}
      </Animated.View>

      {/* Horizontal dividers — drawn on top so they always crisp */}
      {showHDividers &&
        Array.from({ length: numRows - 1 }, (_, i) => (
          <View
            key={`hd${i}`}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: (i + 1) * cellHeight + i,
              height: 1,
              backgroundColor: borderColor + '66',
              zIndex: 4,
            }}
          />
        ))}
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

export const PAYLINE_COLORS: Record<WinLineId, string> = {
  MID:       Colors.credits,
  TOP:       Colors.attack,
  BOT:       Colors.raid,
  DIAG_DOWN: Colors.accent,
  DIAG_UP:   Colors.success,
  HR0:       Colors.attack,
  HR1:       Colors.credits,
  HR2:       Colors.primary,
  HR3:       Colors.raid,
  HR4:       Colors.shield,
  D5_DOWN:   Colors.accent,
  D5_UP:     Colors.success,
  V_DOWN:    Colors.warning,
  V_UP:      Colors.info,
  W_SHAPE:   Colors.danger,
};

const ACTIVE_LINE_IDS: Record<1 | 3 | 5, WinLineId[]> = {
  1: ['MID'],
  3: ['MID', 'TOP', 'BOT'],
  5: ['MID', 'TOP', 'BOT', 'DIAG_DOWN', 'DIAG_UP'],
};

const ACTIVE_LINE_IDS_5X5: WinLineId[] = [
  'HR0', 'HR1', 'HR2', 'HR3', 'HR4',
  'D5_DOWN', 'D5_UP', 'V_DOWN', 'V_UP', 'W_SHAPE',
];

// Container has paddingHorizontal: 24, so track width = screen width - 48
const TRACK_W = Dimensions.get('window').width - 48;

interface PaylineGuidesProps {
  activeIds: WinLineId[];
  winLineIds: Set<WinLineId>;
  isSpinning: boolean;
  CELL_H: number;
  cols: number;
}

function PaylineGuides({ activeIds, winLineIds, isSpinning, CELL_H, cols }: PaylineGuidesProps) {
  const ROW_H = CELL_H + 1; // +1 for divider
  const cellW = TRACK_W / cols;

  const rowY = (r: number) => r * ROW_H + CELL_H / 2;
  const colX = (c: number) => c * cellW + cellW / 2;

  // Render each line as a chain of segments between adjacent column points so
  // multi-bend patterns (zigzag, W-shape) render correctly for 5x5.
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' as any }]}>
      {activeIds.map((lineId) => {
        const pattern = LINE_PATTERNS[lineId];
        const isWinning = !isSpinning && winLineIds.has(lineId);
        const lineColor = isWinning
          ? PAYLINE_COLORS[lineId]
          : isSpinning
            ? Colors.textMuted + '60'
            : Colors.textMuted + '30';
        const thickness = isWinning ? 3 : 2;
        const isStraight = pattern.every((r) => r === pattern[0]);

        if (isStraight) {
          const y = rowY(pattern[0]);
          return (
            <View
              key={lineId}
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: y - Math.floor(thickness / 2),
                height: thickness,
                backgroundColor: lineColor,
              }}
            />
          );
        }

        const segments: { left: number; top: number; width: number; angle: number }[] = [];
        for (let c = 0; c < pattern.length - 1; c++) {
          const x0 = colX(c);
          const y0 = rowY(pattern[c]);
          const x1 = colX(c + 1);
          const y1 = rowY(pattern[c + 1]);
          const dx = x1 - x0;
          const dy = y1 - y0;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const cx = (x0 + x1) / 2;
          const cy = (y0 + y1) / 2;
          segments.push({ left: cx - length / 2, top: cy - Math.floor(thickness / 2), width: length, angle });
        }
        return (
          <View key={lineId} style={StyleSheet.absoluteFill} pointerEvents="none">
            {segments.map((s, i) => (
              <View
                key={i}
                style={{
                  position: 'absolute',
                  left: s.left,
                  top: s.top,
                  width: s.width,
                  height: thickness,
                  backgroundColor: lineColor,
                  transform: [{ rotate: `${s.angle}deg` }],
                }}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

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
  const activeThemeId  = useCosmeticsStore((s) => s.active['REEL_THEME']  ?? 'theme_standard');
  const activeSymbolId = useCosmeticsStore((s) => s.active['SYMBOL_PACK'] ?? 'sym_default');
  const theme: ReelThemeTokens = REEL_THEME_TOKENS[activeThemeId] ?? REEL_THEME_TOKENS.theme_standard;
  const themeImage = REEL_THEME_IMAGE_MAP[activeThemeId];
  const glyphs = SYMBOL_PACK_GLYPHS[activeSymbolId] ?? SYMBOL_PACK_GLYPHS.sym_default;
  const outpostLevel = useHabitatStore((s) => s.outpostLevel);

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
    const wl = activeWinLines[0];
    const [r0, r1, r2] = wl.result.reels;
    if (r0 === r1 && r1 === r2) return 'TRIPLE';
    return 'LINE WIN';
  }, [activeWinLines, isSpinning]);

  const grid = getGridConfig(outpostLevel);

  // Per-cell highlight colors for multi-row mode (sized to grid).
  const cellHighlights = useMemo(() => {
    const h: (string | null)[][] = Array.from({ length: grid.rows }, () =>
      Array.from({ length: grid.cols }, () => null as string | null),
    );
    if (!activeWinLines || isSpinning) return h;
    for (const wl of activeWinLines) {
      const pattern = LINE_PATTERNS[wl.id];
      const color = winLineColor(wl);
      for (let col = 0; col < pattern.length && col < grid.cols; col++) {
        const row = pattern[col];
        if (row < grid.rows) h[row][col] = color;
      }
    }
    return h;
  }, [activeWinLines, isSpinning, grid.rows, grid.cols]);

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

  // --- Unified rendering for 1x3 / 3x3 / 5x5 ---
  const isFiveByFive = grid.size === '5x5';
  const isOneByThree = grid.size === '1x3';
  const CELL_H = isFiveByFive ? 50 : isOneByThree ? 100 : 80;
  const symbolSize = isFiveByFive
    ? Typography.sizes.md
    : isOneByThree
    ? Typography.sizes.hero
    : Typography.sizes.xl;
  const showHDividers = !isOneByThree;
  const showMidRowBg  = !isOneByThree;

  const displayLabel = isOneByThree ? winLabel : multiWinLabel;
  const displayColor = displayLabel === 'JACKPOT' ? Colors.credits
                     : displayLabel === 'TRIPLE'  ? Colors.primary
                     : isOneByThree ? winColor
                     : Colors.success;

  const activeIds = isFiveByFive ? ACTIVE_LINE_IDS_5X5 : ACTIVE_LINE_IDS[grid.numLines as 1 | 3 | 5];
  const winIds = new Set<WinLineId>((activeWinLines ?? []).map((wl) => wl.id));

  const nextUnlock = isOneByThree                       ? { lines: 3, level: 3 }
                   : !isFiveByFive && grid.numLines < 3 ? { lines: 3, level: 3 }
                   : !isFiveByFive && grid.numLines < 5 ? { lines: 5, level: 6 }
                   : !isFiveByFive                      ? { lines: 10, level: 10 }
                   : null;

  const colIndices = Array.from({ length: grid.cols }, (_, i) => i);

  // Resolve the target symbol for each cell. For 1x3 we display the single-row
  // result; for 3x3/5x5 we use the full reelWindow.
  const resolveTargets = (col: number): SlotSymbol[] => {
    if (isOneByThree) {
      // Single-row mode: each column has 1 cell; use the corresponding reel.
      const r = reelWindow ? reelWindow[Math.floor(reelWindow.length / 2)][col] : reels[col];
      return [r];
    }
    return Array.from({ length: grid.rows }, (_, row) => reelWindow?.[row]?.[col] ?? 'EMPTY' as SlotSymbol);
  };

  const resolveHighlights = (col: number): (string | null)[] => {
    if (isOneByThree) {
      // For 1x3, use the simple-mode reelWins for the single visible row.
      return [reelWins[col] ? Colors.credits : null];
    }
    return Array.from({ length: grid.rows }, (_, row) => cellHighlights[row]?.[col] ?? null);
  };

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.track, styles.multiTrack, { backgroundColor: theme.trackBg, borderColor: theme.borderColor }, trackScaleStyle]}>
        {themeImage && (
          <Image
            source={themeImage}
            style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
            resizeMode="cover"
            pointerEvents="none"
          />
        )}
        <View style={styles.colsRow}>
          {colIndices.map((col) => (
            <ReelColumn
              key={col}
              targetSymbols={resolveTargets(col)}
              isSpinning={isSpinning}
              colIndex={col}
              cellHeight={CELL_H}
              symbolSize={symbolSize}
              glyphs={glyphs}
              cellBg={theme.cellBg}
              borderColor={theme.borderColor}
              cellHighlights={resolveHighlights(col)}
              midRowBg={showMidRowBg ? theme.midRowBg : undefined}
              showHDividers={showHDividers}
              showLeftDivider={col > 0}
            />
          ))}
        </View>
        {!isOneByThree && (
          <PaylineGuides activeIds={activeIds} winLineIds={winIds} isSpinning={isSpinning} CELL_H={CELL_H} cols={grid.cols} />
        )}
      </Animated.View>
      {displayLabel !== '' && !isSpinning && (
        <View style={[styles.winBadge, { backgroundColor: displayColor }]}>
          <Text style={styles.winBadgeText}>{displayLabel}</Text>
        </View>
      )}
      <View style={styles.linesRow}>
        <Text style={styles.linesActive}>
          {isOneByThree ? '1 PAYLINE' : `${activeIds.length} PAYLINE${activeIds.length !== 1 ? 'S' : ''}`}
        </Text>
        {nextUnlock && (
          <Text style={styles.linesUnlock}>
            {isOneByThree ? '+2 at Outpost Lv.3' : `+${nextUnlock.lines - activeIds.length} at Outpost Lv.${nextUnlock.level}`}
          </Text>
        )}
      </View>
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
  colsRow: {
    flexDirection: 'row',
    width: '100%',
  },
  multiRow: {
    flexDirection: 'row',
    width: '100%',
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
  linesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  linesActive: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 2,
    fontWeight: '600',
  },
  linesUnlock: {
    fontSize: 9,
    color: Colors.accent + '99',
    letterSpacing: 1,
  },
});
