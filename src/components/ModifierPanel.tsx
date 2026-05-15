import { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useAnomalyStore } from '@/store/useAnomalyStore';
import { useGameStore } from '@/store/useGameStore';
import { useDroneStore } from '@/store/useDroneStore';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

type DisplayMode = 'dots' | 'numbers';
const STORAGE_KEY = '@modifier_panel_mode';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const RIFT_LABELS: Record<number, string> = {
  0: 'NO RIFT',
  1: 'RIFT I  ↑ CREDITS',
  2: 'RIFT II  ↑↑ JACKPOT',
  3: 'RIFT III  ↑↑↑ JACKPOT',
};

function dots(filled: number, max = 5): string {
  const f = Math.min(max, Math.max(0, Math.round(filled)));
  return '●'.repeat(f) + '○'.repeat(max - f);
}

function creditMultToDots(mult: number): number {
  if (mult <= 1.0) return 1;
  if (mult <= 1.5) return 2;
  if (mult <= 2.0) return 3;
  if (mult <= 2.5) return 4;
  return 5;
}

function formatMs(ms: number): string {
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface ModifierRowProps {
  label: string;
  value: string;
  dotCount: number;
  color: string;
  mode: DisplayMode;
}

function ModifierRow({ label, value, dotCount, color, mode }: ModifierRowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {mode === 'dots' ? (
          <>
            <Text style={[styles.dotsLarge, { color }]}>{dots(dotCount)}</Text>
            <Text style={[styles.valueSmall, { color }]}>{value}</Text>
          </>
        ) : (
          <>
            <Text style={[styles.valueLarge, { color }]}>{value}</Text>
            <Text style={[styles.dotsSmall, { color }]}>{dots(dotCount)}</Text>
          </>
        )}
      </View>
    </View>
  );
}

export function ModifierPanel() {
  const { definition, msRemaining } = useAnomalyStore();
  const riftTier = useGameStore((s) => s.riftTier);
  const isSpinning = useGameStore((s) => s.isSpinning);
  const { activeDrones, getEffects } = useDroneStore();
  const [mode, setMode] = useState<DisplayMode>('dots');

  const prevSpinningRef = useRef(isSpinning);
  const glowT = useSharedValue(0);

  const panelStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(glowT.value, [0, 1], [Colors.border, Colors.accent]),
  }));

  useEffect(() => {
    if (!isSpinning && prevSpinningRef.current) {
      glowT.value = withSequence(
        withTiming(1, { duration: 180 }),
        withTiming(0, { duration: 700 }),
      );
    }
    prevSpinningRef.current = isSpinning;
  }, [isSpinning]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === 'numbers') setMode('numbers');
    });
  }, []);

  function toggleMode() {
    const next: DisplayMode = mode === 'dots' ? 'numbers' : 'dots';
    setMode(next);
    AsyncStorage.setItem(STORAGE_KEY, next);
  }

  const effects = getEffects();
  const anomalyCreditMult = definition?.creditMultiplier ?? 1;
  const droneCreditMult = effects.creditMultiplier;
  const totalCreditMult = anomalyCreditMult * droneCreditMult;

  const hasAnyModifier =
    totalCreditMult !== 1 ||
    riftTier > 0 ||
    activeDrones.length > 0 ||
    definition !== null;

  if (!hasAnyModifier) return null;

  return (
    <AnimatedPressable onPress={toggleMode} style={[styles.panel, panelStyle]}>
      <View style={styles.header}>
        <Text style={styles.panelTitle}>ACTIVE EFFECTS</Text>
        <Text style={styles.toggleHint}>{mode === 'dots' ? '123' : '●●●'}</Text>
      </View>

      {totalCreditMult !== 1 && (
        <ModifierRow
          label="CREDIT YIELD"
          value={`×${totalCreditMult.toFixed(2)}`}
          dotCount={creditMultToDots(totalCreditMult)}
          color={Colors.credits}
          mode={mode}
        />
      )}

      {riftTier > 0 && (
        <ModifierRow
          label="RIFT"
          value={RIFT_LABELS[riftTier]}
          dotCount={riftTier === 1 ? 2 : riftTier === 2 ? 3 : 5}
          color={Colors.accent}
          mode={mode}
        />
      )}

      {effects.blocksNextAttack && (
        <ModifierRow
          label="SENTINEL"
          value="ATTACK BLOCKED"
          dotCount={3}
          color={Colors.shield}
          mode={mode}
        />
      )}

      {effects.blocksNextRaid && (
        <ModifierRow
          label="SCRAMBLER"
          value="RAID BLOCKED"
          dotCount={3}
          color={Colors.accent}
          mode={mode}
        />
      )}

      {effects.raidLootBonus > 0 && (
        <ModifierRow
          label="RAID LOOT"
          value={`+${Math.round(effects.raidLootBonus * 100)}%`}
          dotCount={Math.ceil(effects.raidLootBonus * 5)}
          color={Colors.raid}
          mode={mode}
        />
      )}

      {definition && (
        <ModifierRow
          label={definition.name}
          value={msRemaining > 0 ? formatMs(msRemaining) : 'FADING'}
          dotCount={creditMultToDots(definition.creditMultiplier > 1 ? definition.creditMultiplier : 1.5)}
          color={definition.color}
          mode={mode}
        />
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  panelTitle: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
  },
  toggleHint: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    letterSpacing: 1,
    flex: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 1,
  },
  dotsLarge: {
    fontSize: Typography.sizes.sm,
    letterSpacing: 2,
  },
  dotsSmall: {
    fontSize: 10,
    letterSpacing: 1,
  },
  valueLarge: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  valueSmall: {
    fontSize: 10,
    letterSpacing: 1,
  },
});
