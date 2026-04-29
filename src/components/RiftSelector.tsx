import { View, Text, Pressable, StyleSheet } from 'react-native';
import { TemporalRiftTier, RIFT_COSTS } from '@/services/SlotsEngine';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';

const RIFT_LABELS: Record<TemporalRiftTier, string> = {
  0: 'NO RIFT',
  1: 'RIFT I',
  2: 'RIFT II',
  3: 'RIFT III',
};

const RIFT_DESCRIPTIONS: Record<TemporalRiftTier, string> = {
  0: 'Standard odds',
  1: 'Shift toward credits',
  2: 'Amplify credit rewards',
  3: 'Maximize jackpot odds',
};

interface Props {
  currentTier: TemporalRiftTier;
  availableCredits: number;
  onSelect: (tier: TemporalRiftTier) => void;
}

export function RiftSelector({ currentTier, availableCredits, onSelect }: Props) {
  const tiers: TemporalRiftTier[] = [0, 1, 2, 3];

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>TEMPORAL RIFT</Text>
      <View style={styles.tiers}>
        {tiers.map((tier) => {
          const cost = RIFT_COSTS[tier];
          const canAfford = availableCredits >= cost;
          const isActive = tier === currentTier;

          return (
            <Pressable
              key={tier}
              onPress={() => onSelect(tier)}
              disabled={!canAfford && tier !== 0}
              style={[
                styles.tierButton,
                isActive && styles.tierButtonActive,
                !canAfford && tier !== 0 && styles.tierButtonLocked,
              ]}
            >
              <Text style={[styles.tierLabel, isActive && styles.tierLabelActive]}>
                {RIFT_LABELS[tier]}
              </Text>
              <Text style={[styles.tierCost, !canAfford && styles.tierCostLocked]}>
                {cost > 0 ? `${cost} CR` : ' '}
              </Text>
              <Text style={styles.tierDesc} numberOfLines={1}>
                {RIFT_DESCRIPTIONS[tier]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
  },
  heading: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
    marginBottom: Spacing.sm,
  },
  tiers: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  tierButton: {
    flex: 1,
    height: 76,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceElevated,
  },
  tierButtonLocked: {
    opacity: 0.4,
  },
  tierLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  tierLabelActive: {
    color: Colors.accent,
  },
  tierCost: {
    fontSize: Typography.sizes.xs,
    color: Colors.credits,
    marginTop: 2,
  },
  tierCostLocked: {
    color: Colors.textMuted,
  },
  tierDesc: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
});
