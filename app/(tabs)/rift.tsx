import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LegendCard, LegendSection, LegendRow, LegendNote } from '@/components/LegendCard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGameStore } from '@/store/useGameStore';
import { useAnomalyStore } from '@/store/useAnomalyStore';
import { TemporalRiftTier, RIFT_COSTS } from '@/services/SlotsEngine';
import { anomalyService } from '@/services/AnomalyService';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const RIFT_DETAILS: Record<TemporalRiftTier, { label: string; effect: string; color: string }> = {
  0: { label: 'NO RIFT', effect: 'Standard probability. No modifiers.', color: Colors.textMuted },
  1: { label: 'RIFT I', effect: '+5 to CREDIT_SMALL weight, +3 to CREDIT_MEDIUM. Shift toward frequent small wins.', color: '#7B9FFF' },
  2: { label: 'RIFT II', effect: '+8 to CREDIT_MEDIUM, +5 to CREDIT_LARGE. Amplify mid-tier credit rewards.', color: Colors.accent },
  3: { label: 'RIFT III', effect: '+12 to CREDIT_LARGE. Maximize jackpot probability. High risk, high reward.', color: Colors.primary },
};

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function RiftScreen() {
  const { credits, riftTier, setRiftTier } = useGameStore();
  const [legendVisible, setLegendVisible] = useState(false);
  const { definition, msRemaining } = useAnomalyStore();

  function handleSelect(tier: TemporalRiftTier) {
    const rawCost = RIFT_COSTS[tier];
    const actualCost = anomalyService.applyToRiftCost(rawCost);
    if (credits >= actualCost) setRiftTier(tier);
  }

  const tiers: TemporalRiftTier[] = [0, 1, 2, 3];

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>TEMPORAL RIFT</Text>
        <Text style={styles.subtitle}>Bend probability. Pay the price.</Text>
      </View>

      {/* Anomaly banner */}
      {definition && (
        <View style={[styles.anomalyBanner, { borderColor: definition.color }]}>
          <View style={styles.anomalyTop}>
            <Text style={[styles.anomalyName, { color: definition.color }]}>
              {definition.name}
            </Text>
            {msRemaining > 0 && (
              <Text style={styles.anomalyTimer}>{formatMs(msRemaining)}</Text>
            )}
          </View>
          <Text style={styles.anomalyDesc}>{definition.description}</Text>
          {definition.riftCostMultiplier < 1 && (
            <Text style={[styles.anomalyBonus, { color: definition.color }]}>
              ↓ Rift costs reduced to {Math.round(definition.riftCostMultiplier * 100)}%
            </Text>
          )}
          {definition.creditMultiplier > 1 && (
            <Text style={[styles.anomalyBonus, { color: definition.color }]}>
              ↑ Credit yield ×{definition.creditMultiplier}
            </Text>
          )}
        </View>
      )}

      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.sectionHeader}>SELECT RIFT TIER</Text>

        {tiers.map((tier) => {
          const rawCost = RIFT_COSTS[tier];
          const actualCost = anomalyService.applyToRiftCost(rawCost);
          const discounted = actualCost < rawCost;
          const canAfford = credits >= actualCost;
          const isActive = tier === riftTier;
          const details = RIFT_DETAILS[tier];

          return (
            <Pressable
              key={tier}
              onPress={() => handleSelect(tier)}
              disabled={!canAfford}
              style={[
                styles.card,
                isActive && { borderColor: details.color },
                !canAfford && styles.cardLocked,
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.tierLabel, { color: isActive ? details.color : Colors.textSecondary }]}>
                  {details.label}
                </Text>
                {isActive && (
                  <View style={[styles.activeBadge, { backgroundColor: details.color }]}>
                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                  </View>
                )}
                {tier > 0 && (
                  <View style={styles.costBlock}>
                    {discounted && (
                      <Text style={styles.costStrike}>{rawCost} CR</Text>
                    )}
                    <Text style={[styles.costValue, { color: canAfford ? Colors.credits : Colors.textMuted }]}>
                      {actualCost} CR
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.effectText}>{details.effect}</Text>
            </Pressable>
          );
        })}

        <Text style={styles.footnote}>
          Rift tier is set per spin. Cost is deducted each time you press SPIN.
          Anomaly events may reduce costs or amplify outcomes.
        </Text>
      </ScrollView>

      <Pressable style={styles.legendBtn} onPress={() => setLegendVisible(true)} hitSlop={12}>
        <Text style={styles.legendBtnText}>?</Text>
      </Pressable>

      <LegendCard visible={legendVisible} onDismiss={() => setLegendVisible(false)} title="RIFT LEGEND" accentColor={Colors.accent}>
        <LegendSection label="TIER COSTS & EFFECTS" />
        <LegendRow left="Tier 0  —  FREE" right="Base odds, no modifier" />
        <LegendRow left="Tier 1  —  50 CR" right="+Credits, fewer empty slots" />
        <LegendRow left="Tier 2  —  150 CR" right="Jackpot odds boosted" color={Colors.primary} />
        <LegendRow left="Tier 3  —  400 CR" right="Max jackpot bias + combat drops" color={Colors.credits} />
        <LegendSection label="ANOMALY INTERACTION" />
        <LegendRow left="Active anomalies may halve rift costs" />
        <LegendRow left="Some anomalies amplify rift payouts" />
        <LegendNote text="Cost is deducted before each spin. If credits run low the rift auto-resets to Tier 0." />
      </LegendCard>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 6,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginTop: 2,
  },
  anomalyBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    backgroundColor: Colors.surfaceElevated,
    gap: 4,
  },
  anomalyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  anomalyName: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  anomalyTimer: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  anomalyDesc: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },
  anomalyBonus: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
    marginTop: 2,
  },
  list: { padding: Spacing.md, gap: Spacing.md },
  sectionHeader: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
    marginBottom: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  cardLocked: { opacity: 0.4 },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  tierLabel: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  activeBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  activeBadgeText: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    color: Colors.background,
    letterSpacing: 2,
  },
  costBlock: { alignItems: 'flex-end' },
  costStrike: {
    fontSize: 9,
    color: Colors.textMuted,
    textDecorationLine: 'line-through',
  },
  costValue: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
  },
  effectText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  footnote: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
  legendBtn: {
    position: 'absolute',
    top: 14,
    right: Spacing.md,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  legendBtnText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
  },
});
