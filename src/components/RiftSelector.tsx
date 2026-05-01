import { View, Text, Pressable, StyleSheet } from 'react-native';
import { TemporalRiftTier, RIFT_COSTS } from '@/services/SlotsEngine';
import { Colors, Typography, BorderRadius, Spacing } from '@/constants/theme';

const RIFT_LABELS: Record<TemporalRiftTier, string> = {
  0: 'NO RIFT',
  1: 'RIFT I',
  2: 'RIFT II',
  3: 'RIFT III',
};

// Concrete weight-delta summaries shown directly to the player.
// The actual deltas live in SlotsEngine; this is a faithful summary
// the player can verify in the legend card.
const RIFT_BOOSTS: Record<TemporalRiftTier, string> = {
  0: '—',
  1: '+5 ●  +3 ●●',
  2: '+8 ●●  +5 ★',
  3: '+12 ★  +6 ●●',
};

const RIFT_PENALTIES: Record<TemporalRiftTier, string> = {
  0: '—',
  1: '−4 EMPTY',
  2: '−5 EMPTY',
  3: '−10 ●  −8 EMPTY',
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
                {cost > 0 ? `${cost} CR` : 'free'}
              </Text>
              {tier > 0 && (
                <>
                  <Text style={styles.tierBoost} numberOfLines={1}>{RIFT_BOOSTS[tier]}</Text>
                  <Text style={styles.tierPenalty} numberOfLines={1}>{RIFT_PENALTIES[tier]}</Text>
                </>
              )}
              {tier === 0 && (
                <Text style={styles.tierDesc}>Standard odds</Text>
              )}
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
    minHeight: 92,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 2,
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
    fontSize: 10,
    color: Colors.credits,
    letterSpacing: 1,
  },
  tierCostLocked: {
    color: Colors.textMuted,
  },
  tierBoost: {
    fontSize: 9,
    color: Colors.success,
    letterSpacing: 1,
    marginTop: 2,
  },
  tierPenalty: {
    fontSize: 9,
    color: Colors.danger,
    letterSpacing: 1,
  },
  tierDesc: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 2,
    textAlign: 'center',
  },
});
