import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { CreditCounter } from '@/components/CreditCounter';

interface ResourcePillProps {
  label: string;
  value: number;
  color: string;
}

function ResourcePill({ label, value, color }: ResourcePillProps) {
  return (
    <View style={styles.pill}>
      <Text style={[styles.pillValue, { color }]}>{value.toLocaleString()}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

interface Props {
  credits: number;
  attacks: number;
  raids: number;
  shields: number;
  spinsRemaining: number;
  style?: ViewStyle;
}

export function ResourceBar({ credits, attacks, raids, shields, spinsRemaining, style }: Props) {
  const spinsColor = spinsRemaining <= 5 ? Colors.warning : Colors.accent;
  return (
    <View style={[styles.container, style]}>
      <View style={styles.pill}>
        <CreditCounter value={credits} color={Colors.credits} style={styles.pillValue} />
        <Text style={styles.pillLabel}>CREDITS</Text>
      </View>
      <ResourcePill label="FUEL" value={attacks} color={Colors.attack} />
      <ResourcePill label="BOOST" value={raids} color={Colors.raid} />
      <ResourcePill label="SHIELDS" value={shields} color={Colors.shield} />
      <ResourcePill label="SPINS" value={spinsRemaining} color={spinsColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pill: {
    alignItems: 'center',
  },
  pillValue: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    lineHeight: 20,
  },
  pillLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
});
