import { useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useGameStore } from '@/store/useGameStore';
import { SlotSymbol, SpinResult } from '@/services/SlotsEngine';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const DRAWER_HEIGHT = 420;

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

function outcomeLabel(r: SpinResult): string {
  const [a, b, c] = r.reels;
  const triple = a === b && b === c;
  const suffix = triple ? ' ×3' : '';
  switch (r.outcomeType) {
    case 'CREDITS':    return `+${r.creditsWon.toLocaleString()} CR${suffix}`;
    case 'ATTACK':     return `+${r.attacksWon} FUEL${suffix}`;
    case 'RAID':       return `+${r.raidsWon} SIGNAL${suffix}`;
    case 'SHIELD':     return `+${r.shieldsWon} SHIELD${suffix}`;
    case 'INTRUSION':  return `+${r.intrusionsWon} BREACH${suffix}`;
    case 'EXTRACTION': return `+${r.extractionsWon} BEAM${suffix}`;
    default:           return 'Nothing';
  }
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function SpinHistoryDrawer({ visible, onClose }: Props) {
  const spinHistory       = useGameStore((s) => s.spinHistory);
  const sessionSpins      = useGameStore((s) => s.sessionSpins);
  const sessionCredits    = useGameStore((s) => s.sessionCreditsEarned);

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
      {/* Backdrop */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View style={[styles.drawer, drawerStyle]}>
        {/* Handle */}
        <View style={styles.handle} />

        <View style={styles.headerRow}>
          <Text style={styles.title}>SPIN HISTORY</Text>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.closeBtn}>✕</Text>
          </Pressable>
        </View>

        {/* Session stats */}
        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Text style={styles.statValue}>{sessionSpins}</Text>
            <Text style={styles.statLabel}>SPINS</Text>
          </View>
          <View style={[styles.statChip, { borderColor: Colors.credits + '66' }]}>
            <Text style={[styles.statValue, { color: Colors.credits }]}>
              +{sessionCredits.toLocaleString()}
            </Text>
            <Text style={styles.statLabel}>CR EARNED</Text>
          </View>
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        >
          {spinHistory.length === 0 ? (
            <Text style={styles.empty}>No spins yet this session</Text>
          ) : (
            spinHistory.map((r, i) => {
              const color = OUTCOME_COLOR[r.outcomeType];
              const [a, b, c] = r.reels;
              return (
                <View key={i} style={styles.row}>
                  <Text style={styles.reels}>
                    {REEL_GLYPH[a]}  {REEL_GLYPH[b]}  {REEL_GLYPH[c]}
                  </Text>
                  <Text style={[styles.outcome, { color }]}>{outcomeLabel(r)}</Text>
                </View>
              );
            })
          )}
        </ScrollView>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    zIndex: 80,
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: DRAWER_HEIGHT,
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderTopWidth: 1,
    borderColor: Colors.border,
    zIndex: 81,
    paddingBottom: Spacing.xl,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  title: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
    letterSpacing: 3,
  },
  closeBtn: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
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
  statValue: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
  },
  statLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  list: { flex: 1 },
  listContent: { padding: Spacing.md, gap: 2 },
  empty: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingTop: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border + '55',
  },
  reels: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    letterSpacing: 2,
    flex: 1,
  },
  outcome: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
    textAlign: 'right',
  },
});
