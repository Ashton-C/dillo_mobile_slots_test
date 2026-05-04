import { useEffect, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useGameStore, SpinHistoryEntry } from '@/store/useGameStore';
import { useEventStore } from '@/store/useEventStore';
import { GameEvent } from '@/services/FirestoreService';
import { SlotSymbol, WinLineId, LINE_PATTERNS } from '@/services/SlotsEngine';
import { PAYLINE_COLORS } from '@/components/ReelDisplay';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const DRAWER_HEIGHT = 540;

const REEL_GLYPH: Record<SlotSymbol, string> = {
  CREDIT_SMALL:  '●',
  CREDIT_MEDIUM: '●●',
  CREDIT_LARGE:  '★',
  ATTACK:        '⚡',
  RAID:          '◈',
  SHIELD:        '◉',
  INTRUSION:     '⚔',
  EXTRACTION:    '⛏',
  EMPTY:         '○',
};

const OUTCOME_COLOR: Record<string, string> = {
  CREDITS:    Colors.credits,
  ATTACK:     Colors.attack,
  RAID:       Colors.raid,
  SHIELD:     Colors.shield,
  INTRUSION:  Colors.danger,
  EXTRACTION: Colors.accent,
  NOTHING:    Colors.textMuted,
};

function formatAge(ts: number): string {
  const age = Date.now() - ts;
  if (age < 60_000) return 'now';
  if (age < 3_600_000) return `${Math.floor(age / 60_000)}m`;
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)}h`;
  return `${Math.floor(age / 86_400_000)}d`;
}

function matchLabel(reels: [SlotSymbol, SlotSymbol, SlotSymbol]): string {
  const [a, b, c] = reels;
  if (a === b && b === c) return 'TRIPLE';
  if (a === b || b === c || a === c) return 'PAIR';
  return '—';
}

function outcomeBrief(e: SpinHistoryEntry): string {
  switch (e.outcomeType) {
    case 'CREDITS':    return `+${e.finalCreditsWon.toLocaleString()} CR`;
    case 'ATTACK':     return `+${e.attacksWon} FUEL`;
    case 'RAID':       return `+${e.raidsWon} SIGNAL`;
    case 'SHIELD':     return `+${e.shieldsWon} SHIELD`;
    case 'INTRUSION':  return `+${e.intrusionsWon} BREACH`;
    case 'EXTRACTION': return `+${e.extractionsWon} BEAM`;
    default:           return '—';
  }
}

function formatBreakdown(entry: SpinHistoryEntry): string {
  const muls: string[] = [`${entry.baseCreditsWon}`];
  if (entry.signalBoostUsed)         muls.push('× 1.5 (BOOST)');
  if (entry.droneMultiplier !== 1)   muls.push(`× ${entry.droneMultiplier.toFixed(2)} (DRONE)`);
  if (entry.anomalyMultiplier !== 1) muls.push(`× ${entry.anomalyMultiplier.toFixed(1)} (ANOM)`);
  let expr = muls.join(' ');
  if (entry.overclockBonus > 0) expr += ` + ${entry.overclockBonus} (OC)`;
  if (entry.riftCost > 0)       expr += ` − ${entry.riftCost} (RIFT)`;
  expr += ` = ${entry.finalCreditsWon.toLocaleString()} CR`;
  return expr;
}

function combatBrief(ev: GameEvent): { label: string; sub: string; color: string; icon: string } {
  switch (ev.type) {
    case 'ATTACK_INCOMING':
      return { icon: '⚠', label: `Breach attempt by ${ev.fromDisplayName}`, sub: 'incoming', color: Colors.danger };
    case 'RAID_INCOMING':
      return { icon: '⚠', label: `Extraction beam from ${ev.fromDisplayName}`, sub: 'incoming', color: Colors.accent };
    case 'ATTACK_RESOLVED':
      return ev.attackerWon
        ? { icon: '✗', label: `Breached by ${ev.fromDisplayName}`, sub: `lost ${ev.creditsLost ?? 0} CR`, color: Colors.danger }
        : { icon: '◉', label: `Repelled ${ev.fromDisplayName}`, sub: 'breach defended', color: Colors.shield };
    case 'RAID_RESOLVED':
      return ev.attackerWon
        ? { icon: '✗', label: `${ev.fromDisplayName} extracted`, sub: `lost ${ev.creditsLost ?? 0} CR`, color: Colors.accent }
        : { icon: '◉', label: `Vault held vs ${ev.fromDisplayName}`, sub: 'extraction blocked', color: Colors.shield };
    case 'COMBAT_RESULT':
      return ev.attackerWon
        ? { icon: '⚔', label: `Raid on ${ev.fromDisplayName} succeeded`, sub: `+${ev.creditsGained ?? 0} CR`, color: Colors.success }
        : { icon: '✗', label: `Raid on ${ev.fromDisplayName} failed`, sub: 'no credits taken', color: Colors.textMuted };
    default:
      return { icon: '·', label: 'Transmission', sub: '', color: Colors.textMuted };
  }
}

function ReelGrid({ entry }: { entry: SpinHistoryEntry }) {
  const { reelWindow, winLineIds } = entry;
  if (!reelWindow) return null;

  const winSet = new Set<WinLineId>(winLineIds);

  // Determine highlight color for each [row][col] cell
  const highlights: (string | null)[][] = [[null, null, null], [null, null, null], [null, null, null]];
  for (const lineId of winLineIds) {
    const pattern = LINE_PATTERNS[lineId];
    const color = PAYLINE_COLORS[lineId];
    for (let col = 0; col < 3; col++) {
      highlights[pattern[col]][col] = color;
    }
  }

  return (
    <View style={gridStyles.grid}>
      {([0, 1, 2] as const).map((row) => (
        <View key={row} style={gridStyles.gridRow}>
          {([0, 1, 2] as const).map((col) => {
            const sym = reelWindow[row][col];
            const hlColor = highlights[row][col];
            return (
              <View
                key={col}
                style={[
                  gridStyles.cell,
                  hlColor ? { backgroundColor: hlColor + '33', borderColor: hlColor, borderWidth: 1 } : undefined,
                ]}
              >
                <Text style={gridStyles.cellGlyph}>{REEL_GLYPH[sym]}</Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const gridStyles = StyleSheet.create({
  grid: { flexDirection: 'column', gap: 2 },
  gridRow: { flexDirection: 'row', gap: 2 },
  cell: {
    width: 24,
    height: 24,
    borderRadius: 3,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellGlyph: {
    fontSize: 9,
    color: Colors.textSecondary,
  },
});

function SpinReceipt({ entry }: { entry: SpinHistoryEntry }) {
  const oColor = OUTCOME_COLOR[entry.outcomeType];
  const match = matchLabel(entry.reels);
  const showGrid = !!entry.reelWindow;
  const needsBreakdown = entry.outcomeType === 'CREDITS' && (
    entry.signalBoostUsed || entry.droneMultiplier !== 1 || entry.anomalyMultiplier !== 1 || entry.overclockBonus > 0 || entry.riftCost > 0
  );

  const chips: { label: string; color: string }[] = [];
  if (entry.riftTier > 0)          chips.push({ label: `RIFT T${entry.riftTier}  −${entry.riftCost} CR`, color: Colors.accent });
  if (entry.overclockUsed)         chips.push({ label: `⚡ OVERCLOCK +${entry.overclockBonus}`,           color: Colors.attack });
  if (entry.signalBoostUsed)       chips.push({ label: '▲▲ BOOST  ×1.5 weights',                         color: Colors.raid   });
  if (entry.droneMultiplier > 1)   chips.push({ label: `×${entry.droneMultiplier.toFixed(2)} DRONE`,      color: Colors.primary });
  if (entry.anomalyMultiplier > 1) chips.push({ label: `×${entry.anomalyMultiplier.toFixed(1)} ANOMALY`,  color: Colors.warning });

  const net = entry.finalCreditsWon - entry.riftCost;
  const showNet = entry.riftCost > 0 || entry.finalCreditsWon > 0;

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        {showGrid ? (
          <ReelGrid entry={entry} />
        ) : (
          <Text style={styles.rowReels}>
            {REEL_GLYPH[entry.reels[0]]}  {REEL_GLYPH[entry.reels[1]]}  {REEL_GLYPH[entry.reels[2]]}
          </Text>
        )}
        <Text style={[styles.rowOutcome, { color: oColor }]}>{match}  {outcomeBrief(entry)}</Text>
        <Text style={styles.rowAge}>{formatAge(entry.timestamp)}</Text>
      </View>
      {chips.length > 0 && (
        <View style={styles.chipRow}>
          {chips.map((c, i) => (
            <View key={i} style={[styles.chip, { borderColor: c.color + '99' }]}>
              <Text style={[styles.chipText, { color: c.color }]}>{c.label}</Text>
            </View>
          ))}
        </View>
      )}
      {needsBreakdown && (
        <Text style={[styles.breakdown, { color: net >= 0 ? Colors.success : Colors.danger }]}>
          {formatBreakdown(entry)}
        </Text>
      )}
      {showNet && !needsBreakdown && (
        <Text style={[styles.netLine, { color: net >= 0 ? Colors.success : Colors.danger }]}>
          NET  {net >= 0 ? '+' : ''}{net.toLocaleString()} CR
        </Text>
      )}
    </View>
  );
}

function CombatRow({ event }: { event: GameEvent }) {
  const meta = combatBrief(event);
  return (
    <View style={[styles.row, { borderLeftWidth: 3, borderLeftColor: meta.color }]}>
      <View style={styles.rowHead}>
        <Text style={[styles.combatIcon, { color: meta.color }]}>{meta.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowOutcome, { color: meta.color }]}>{meta.label}</Text>
          {!!meta.sub && <Text style={styles.combatSub}>{meta.sub}</Text>}
        </View>
        <Text style={styles.rowAge}>{formatAge(event.timestamp)}</Text>
      </View>
    </View>
  );
}

type LedgerRow =
  | { kind: 'spin';   ts: number; entry: SpinHistoryEntry }
  | { kind: 'combat'; ts: number; event: GameEvent };

interface Props { visible: boolean; onClose: () => void }

export function LedgerDrawer({ visible, onClose }: Props) {
  const spinHistory    = useGameStore((s) => s.spinHistory);
  const sessionSpins   = useGameStore((s) => s.sessionSpins);
  const sessionCredits = useGameStore((s) => s.sessionCreditsEarned);
  const combatEvents   = useEventStore((s) => s.events);

  const rows = useMemo<LedgerRow[]>(() => {
    const merged: LedgerRow[] = [
      ...spinHistory.map((e) => ({ kind: 'spin'   as const, ts: e.timestamp, entry: e })),
      ...combatEvents.map((e) => ({ kind: 'combat' as const, ts: e.timestamp, event: e })),
    ];
    return merged.sort((a, b) => b.ts - a.ts).slice(0, 40);
  }, [spinHistory, combatEvents]);

  const translateY = useSharedValue(DRAWER_HEIGHT);
  const backdropOp = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 22, stiffness: 260 });
      backdropOp.value = withTiming(1, { duration: 200 });
    } else {
      translateY.value = withTiming(DRAWER_HEIGHT, { duration: 260 }, (done) => {
        if (done) runOnJS(onClose)();
      });
      backdropOp.value = withTiming(0, { duration: 200 });
    }
  }, [visible]);

  const drawerStyle   = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOp.value }));

  if (!visible && translateY.value >= DRAWER_HEIGHT) return null;

  return (
    <>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.drawer, drawerStyle]}>
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <Text style={styles.title}>LEDGER</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.closeBtn}>✕</Text>
          </Pressable>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Text style={styles.statValue}>{sessionSpins}</Text>
            <Text style={styles.statLabel}>SPINS</Text>
          </View>
          <View style={[styles.statChip, { borderColor: Colors.credits + '66' }]}>
            <Text style={[styles.statValue, { color: Colors.credits }]}>+{sessionCredits.toLocaleString()}</Text>
            <Text style={styles.statLabel}>CR EARNED</Text>
          </View>
          <View style={[styles.statChip, { borderColor: Colors.danger + '66' }]}>
            <Text style={[styles.statValue, { color: Colors.danger }]}>{combatEvents.length}</Text>
            <Text style={styles.statLabel}>COMBAT</Text>
          </View>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {rows.length === 0 ? (
            <Text style={styles.empty}>No activity yet</Text>
          ) : (
            rows.map((row, i) =>
              row.kind === 'spin'
                ? <SpinReceipt key={`s${i}-${row.ts}`} entry={row.entry} />
                : <CombatRow   key={`c${row.event.id}`}  event={row.event} />,
            )
          )}
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 80 },
  drawer: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderTopWidth: 1,
    borderColor: Colors.border,
    zIndex: 81,
    paddingBottom: Spacing.xl,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginTop: Spacing.sm },

  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  title: { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, color: Colors.textMuted, letterSpacing: 3 },
  closeBtn: { fontSize: Typography.sizes.sm, color: Colors.textMuted },

  statsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statChip: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold, color: Colors.primary },
  statLabel: { fontSize: 9, color: Colors.textMuted, letterSpacing: 2 },

  list: { flex: 1 },
  listContent: { padding: Spacing.md, gap: Spacing.sm },
  empty: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 1, fontStyle: 'italic', textAlign: 'center', paddingTop: Spacing.lg },

  row: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowReels: { fontSize: Typography.sizes.sm, color: Colors.textSecondary, letterSpacing: 2, minWidth: 80 },
  rowOutcome: { flex: 1, fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, letterSpacing: 1 },
  rowAge: { fontSize: 10, color: Colors.textMuted, letterSpacing: 1 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipText: { fontSize: 10, fontWeight: Typography.weights.bold, letterSpacing: 1 },

  breakdown: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
    fontFamily: Typography.fontFamily,
  },
  netLine: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
    textAlign: 'right',
  },

  combatIcon: { fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold, minWidth: 24, textAlign: 'center' },
  combatSub: { fontSize: 10, color: Colors.textMuted, letterSpacing: 1, marginTop: 2 },
});
