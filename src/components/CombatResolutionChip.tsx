import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { CombatRequestResolution } from '@/services/FirestoreService';

interface Props {
  won: boolean;          // local mini-game outcome (for the loss path & power)
  power: number;         // attackerPower sent to the server
  resolution: CombatRequestResolution | null;
}

// Surfaces the server-resolved outcome of a combat request beneath the
// mini-game's local result. Has three visible states:
//   1. waiting — server hasn't replied yet (RESOLVING…)
//   2. resolved win — shows credits gained + bonus breakdown
//   3. resolved loss / turret block — shows why
export function CombatResolutionChip({ won, power, resolution }: Props) {
  const pulse = useSharedValue(0.4);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const status   = resolution?.status   ?? 'PENDING';
  const outcome  = resolution?.outcome;
  const isResolved = status === 'RESOLVED';
  const turretBlocked = outcome === 'BLOCKED_BY_TURRET';
  const serverWon  = outcome === 'ATTACKER_WON';

  if (!isResolved) {
    return (
      <View style={[styles.chip, { borderColor: Colors.border }]}>
        <Animated.Text style={[styles.waitingText, pulseStyle]}>
          RESOLVING WITH SERVER…
        </Animated.Text>
        <Text style={styles.subtle}>POWER SENT · {power}</Text>
      </View>
    );
  }

  if (turretBlocked) {
    return (
      <View style={[styles.chip, { borderColor: Colors.warning + 'AA' }]}>
        <Text style={[styles.title, { color: Colors.warning }]}>⛨  TURRET BLOCK</Text>
        <Text style={styles.subtle}>Defender's TURRET intercepted — no loot.</Text>
      </View>
    );
  }

  if (serverWon && resolution?.creditsGained != null) {
    const credits  = resolution.creditsGained;
    const vaultPct = Math.round((resolution.vaultReduction ?? 0) * 100);
    const anomPct  = Math.round((resolution.anomalyBonus  ?? 0) * 100);
    const dronePct = Math.round((resolution.droneBonus    ?? 0) * 100);
    const hasMods  = vaultPct > 0 || anomPct > 0 || dronePct > 0;
    return (
      <View style={[styles.chip, { borderColor: Colors.success + 'AA' }]}>
        <Text style={[styles.title, { color: Colors.success }]}>+{credits.toLocaleString()} CR</Text>
        {hasMods ? (
          <Text style={styles.subtle}>
            {anomPct  > 0 ? `anomaly +${anomPct}%  ·  ` : ''}
            {dronePct > 0 ? `drone +${dronePct}%  ·  `   : ''}
            {vaultPct > 0 ? `VAULT saved ${vaultPct}%`  : ''}
          </Text>
        ) : (
          <Text style={styles.subtle}>Closed-loop transfer — defender lost the same amount.</Text>
        )}
      </View>
    );
  }

  // Defender won (whether the local mini-game showed a hit or miss)
  return (
    <View style={[styles.chip, { borderColor: Colors.danger + 'AA' }]}>
      <Text style={[styles.title, { color: Colors.danger }]}>
        {won ? 'DEFENDER OUT-ROLLED YOU' : 'EXTRACTION REPELLED'}
      </Text>
      <Text style={styles.subtle}>
        Your power {power} · defender's power was higher.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
  },
  title: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  subtle: {
    marginTop: 2,
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    textAlign: 'center',
  },
  waitingText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
    color: Colors.accent,
  },
});
