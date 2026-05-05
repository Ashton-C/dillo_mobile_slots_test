import { View, Text, StyleSheet, Dimensions, Image } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSequence,
  withSpring,
  cancelAnimation,
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

interface ReelProps {
  symbol: SlotSymbol;
  isSpinning: boolean;
  isWinning: boolean;
  colIndex?: number;
  decelStartMs?: number;
  highlightColor?: string | null;
  cellHeight?: number;
  symbolSize?: number;
  glyphs: SymbolGlyphs;
  cellBg: string;
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

// Each reel renders a clipped strip of STRIP_LEN + 1 cells that scrolls vertically.
// Symbols slide upward — new symbols enter from the bottom, old ones exit at the top.
// This gives the "continuous scroll" look of a physical reel instead of random flashing.
const STRIP_LEN = 20;
// Strip cells are slightly smaller than the container so partial cells are visible
// above and below the center, revealing ~3 symbol positions to the eye at once.
const STRIP_CELL_RATIO = 0.72;

function Reel({ symbol, isSpinning, isWinning, colIndex = 0, decelStartMs = 500, highlightColor, cellHeight = 100, symbolSize, glyphs, cellBg }: ReelProps) {
  const STRIP_CELL_H = Math.round(cellHeight * STRIP_CELL_RATIO);
  const TOTAL_H = (STRIP_LEN + 1) * STRIP_CELL_H;

  const centerOn = (i: number) => (cellHeight - STRIP_CELL_H) / 2 - i * STRIP_CELL_H;

  const stripRef = useRef<SlotSymbol[]>(Array.from({ length: STRIP_LEN + 1 }, () => symbol));
  const [, forceUpdate] = useState(0);

  const translateY = useSharedValue(centerOn(0));
  const glowOp     = useSharedValue(0);
  const cellScale  = useSharedValue(1);

  const intervalsRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  function clearAll() {
    intervalsRef.current.forEach(clearInterval);
    timersRef.current.forEach(clearTimeout);
    intervalsRef.current = [];
    timersRef.current = [];
  }

  useEffect(() => {
    if (isSpinning) {
      clearAll();
      glowOp.value = 0;

      // Build strip: STRIP_LEN random symbols, target symbol at the end
      const strip = Array.from({ length: STRIP_LEN }, randomSymbol) as SlotSymbol[];
      strip.push(symbol);
      stripRef.current = strip;
      forceUpdate(n => n + 1);

      // Start at top of strip
      cancelAnimation(translateY);
      translateY.value = centerOn(0);

      // Phase 1 — fast scroll: animate one cell per 95ms interval, symbols slide upward
      let currentIdx = 0;
      const scrollToNext = (duration: number) => {
        currentIdx = Math.min(currentIdx + 1, STRIP_LEN - 1);
        translateY.value = withTiming(centerOn(currentIdx), {
          duration,
          easing: Easing.linear,
        });
      };

      const fast = setInterval(() => scrollToNext(90), 95);
      intervalsRef.current.push(fast);

      // Phase 2 — medium after decelStartMs
      timersRef.current.push(setTimeout(() => {
        clearInterval(fast);
        intervalsRef.current = intervalsRef.current.filter(i => i !== fast);
        const medium = setInterval(() => scrollToNext(130), 140);
        intervalsRef.current.push(medium);

        // Phase 3 — slow deceleration
        timersRef.current.push(setTimeout(() => {
          clearInterval(medium);
          intervalsRef.current = intervalsRef.current.filter(i => i !== medium);
          const slow = setInterval(() => scrollToNext(230), 250);
          intervalsRef.current.push(slow);

          // Phase 4 — land on target (index STRIP_LEN)
          timersRef.current.push(setTimeout(() => {
            clearInterval(slow);
            intervalsRef.current = intervalsRef.current.filter(i => i !== slow);
            void soundService.play((`reelStop${colIndex}` as SoundKey));
            // Overshoot slightly then spring back for the physical "clunk"
            translateY.value = withSequence(
              withTiming(centerOn(STRIP_LEN) - 10, { duration: 180, easing: Easing.out(Easing.quad) }),
              withSpring(centerOn(STRIP_LEN), { damping: 12, stiffness: 300 }),
            );
          }, 280));
        }, 300));
      }, decelStartMs));

    } else if (isWinning) {
      clearAll();
      translateY.value = withTiming(centerOn(STRIP_LEN), { duration: 120 });
      glowOp.value = withSequence(
        withTiming(1, { duration: 180 }),
        withTiming(0.45, { duration: 500 }),
        withTiming(0.85, { duration: 280 }),
        withTiming(0, { duration: 650 }),
      );
      // Pop only the landing (winning) symbol
      cellScale.value = 1;
      cellScale.value = withSequence(
        withSpring(1.2, { damping: 6, stiffness: 260 }),
        withTiming(1, { duration: 320 }),
      );
    } else {
      clearAll();
      translateY.value = withTiming(centerOn(STRIP_LEN), { duration: 150 });
      glowOp.value = withTiming(0, { duration: 200 });
      cellScale.value = withTiming(1, { duration: 150 });
    }

    return clearAll;
  }, [isSpinning, isWinning]);

  // Update strip target when symbol prop changes between spins
  useEffect(() => {
    if (!isSpinning) {
      stripRef.current = Array.from({ length: STRIP_LEN + 1 }, () => symbol);
      translateY.value = centerOn(STRIP_LEN);
      forceUpdate(n => n + 1);
    }
  }, [symbol, isSpinning]);

  const stripStyle     = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const glowStyle      = useAnimatedStyle(() => ({ opacity: glowOp.value }));
  const cellScaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: cellScale.value }] }));

  const glowColor = highlightColor ?? SYMBOL_COLORS[symbol];
  const fontSize = symbolSize ?? (cellHeight >= 90 ? Typography.sizes.hero : Math.round(Typography.sizes.xl * STRIP_CELL_RATIO));

  return (
    <View style={[styles.reelCell, { height: cellHeight, backgroundColor: cellBg, overflow: 'hidden' }]}>
      {/* Win glow backdrop */}
      <Animated.View
        style={[StyleSheet.absoluteFill, { backgroundColor: glowColor + '28' }, glowStyle]}
      />
      {/* Scrolling symbol strip — only the landing cell needs Animated.Text */}
      <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: TOTAL_H }, stripStyle]}>
        {stripRef.current.map((sym, i) => (
          <View key={i} style={{ height: STRIP_CELL_H, alignItems: 'center', justifyContent: 'center' }}>
            <GlyphView
              glyph={glyphs[sym]}
              color={SYMBOL_COLORS[sym]}
              fontSize={fontSize}
              animated={i === STRIP_LEN}
              animatedStyle={cellScaleStyle}
            />
          </View>
        ))}
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

  // --- 1x3 single-row rendering (outpost levels 1-2) ---
  if (grid.size === '1x3') {
    const midRowIdx = reelWindow ? Math.floor(reelWindow.length / 2) : 0;
    const r0 = reelWindow ? reelWindow[midRowIdx][0] : reels[0];
    const r1 = reelWindow ? reelWindow[midRowIdx][1] : reels[1];
    const r2 = reelWindow ? reelWindow[midRowIdx][2] : reels[2];
    return (
      <View style={styles.container}>
        <Animated.View style={[styles.track, { backgroundColor: theme.trackBg, borderColor: theme.borderColor }, trackScaleStyle]}>
          {themeImage && (
            <Image
              source={themeImage}
              style={[StyleSheet.absoluteFill, { opacity: 0.35 }]}
              resizeMode="cover"
              pointerEvents="none"
            />
          )}
          <Reel symbol={r0} isSpinning={isSpinning} isWinning={reelWins[0]} colIndex={0} decelStartMs={400}  glyphs={glyphs} cellBg={theme.cellBg} />
          <View style={[styles.divider, { backgroundColor: theme.borderColor + '99' }]} />
          <Reel symbol={r1} isSpinning={isSpinning} isWinning={reelWins[1]} colIndex={1} decelStartMs={800}  glyphs={glyphs} cellBg={theme.cellBg} />
          <View style={[styles.divider, { backgroundColor: theme.borderColor + '99' }]} />
          <Reel symbol={r2} isSpinning={isSpinning} isWinning={reelWins[2]} colIndex={2} decelStartMs={1200} glyphs={glyphs} cellBg={theme.cellBg} />
        </Animated.View>
        {winLabel !== '' && !isSpinning && (
          <View style={[styles.winBadge, { backgroundColor: winColor }]}>
            <Text style={styles.winBadgeText}>{winLabel}</Text>
          </View>
        )}
        <View style={styles.linesRow}>
          <Text style={styles.linesActive}>1 PAYLINE</Text>
          <Text style={styles.linesUnlock}>+2 at Outpost Lv.3</Text>
        </View>
      </View>
    );
  }

  // --- 3x3 / 5x5 multi-row rendering ---
  const isFiveByFive = grid.size === '5x5';
  const CELL_H = isFiveByFive ? 46 : 62;
  const displayLabel = multiWinLabel;
  const displayColor = displayLabel === 'JACKPOT' ? Colors.credits
                     : displayLabel === 'TRIPLE'  ? Colors.primary
                     : Colors.success;

  const activeIds = isFiveByFive ? ACTIVE_LINE_IDS_5X5 : ACTIVE_LINE_IDS[grid.numLines as 1 | 3 | 5];
  const winIds = new Set<WinLineId>((activeWinLines ?? []).map((wl) => wl.id));

  const nextUnlock = !isFiveByFive && grid.numLines < 3 ? { lines: 3, level: 3 }
                   : !isFiveByFive && grid.numLines < 5 ? { lines: 5, level: 6 }
                   : !isFiveByFive ? { lines: 10, level: 10 }
                   : null;

  const rowIndices = Array.from({ length: grid.rows }, (_, i) => i);
  const colIndices = Array.from({ length: grid.cols }, (_, i) => i);
  const midRow = Math.floor(grid.rows / 2);

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
        {rowIndices.map((rowIdx) => (
          <View key={rowIdx}>
            {rowIdx > 0 && <View style={[styles.hDivider, { backgroundColor: theme.borderColor + '66' }]} />}
            <View style={[styles.multiRow, rowIdx === midRow && { backgroundColor: theme.midRowBg }]}>
              {colIndices.map((col) => {
                const sym = reelWindow?.[rowIdx]?.[col] ?? 'EMPTY' as SlotSymbol;
                return (
                  <View key={col} style={styles.multiCellWrap}>
                    {col > 0 && <View style={[styles.divider, { backgroundColor: theme.borderColor + '66' }]} />}
                    <Reel
                      symbol={sym}
                      isSpinning={isSpinning}
                      isWinning={cellHighlights[rowIdx]?.[col] != null}
                      highlightColor={cellHighlights[rowIdx]?.[col]}
                      colIndex={col}
                      decelStartMs={col * 300 + 400}
                      cellHeight={CELL_H}
                      symbolSize={isFiveByFive ? Typography.sizes.md : Typography.sizes.xl}
                      glyphs={glyphs}
                      cellBg={theme.cellBg}
                    />
                  </View>
                );
              })}
            </View>
          </View>
        ))}
        <PaylineGuides activeIds={activeIds} winLineIds={winIds} isSpinning={isSpinning} CELL_H={CELL_H} cols={grid.cols} />
      </Animated.View>
      {displayLabel !== '' && !isSpinning && (
        <View style={[styles.winBadge, { backgroundColor: displayColor }]}>
          <Text style={styles.winBadgeText}>{displayLabel}</Text>
        </View>
      )}
      <View style={styles.linesRow}>
        <Text style={styles.linesActive}>{activeIds.length} PAYLINE{activeIds.length !== 1 ? 'S' : ''}</Text>
        {nextUnlock && (
          <Text style={styles.linesUnlock}>+{nextUnlock.lines - activeIds.length} at Outpost Lv.{nextUnlock.level}</Text>
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
