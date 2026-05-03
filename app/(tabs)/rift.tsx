import { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LegendCard, LegendSection, LegendRow, LegendNote } from '@/components/LegendCard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGameStore } from '@/store/useGameStore';
import { useAnomalyStore } from '@/store/useAnomalyStore';
import { TemporalRiftTier, RIFT_COSTS } from '@/services/SlotsEngine';
import { anomalyService, ANOMALIES, AnomalyId } from '@/services/AnomalyService';
import { SectorTrailMap } from '@/components/SectorTrailMap';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

// Weighted pool: CALM × 1, all others × 2 → 11 total
const ANOMALY_ORDER: AnomalyId[] = ['SOLAR_SURGE', 'VOID_STORM', 'CREDIT_BLOOM', 'SHIELD_PULSE', 'RAID_SHADOW', 'CALM'];
const ANOMALY_CHANCE: Record<AnomalyId, string> = {
  SOLAR_SURGE:  '18%',
  VOID_STORM:   '18%',
  CREDIT_BLOOM: '18%',
  SHIELD_PULSE: '18%',
  RAID_SHADOW:  '18%',
  CALM:          '9%',
};

const RIFT_DETAILS: Record<TemporalRiftTier, { label: string; effect: string; weights: string; penalty: string; color: string }> = {
  0: {
    label: 'NO RIFT',
    effect: 'Standard probability. No cost, no modifiers.',
    weights: 'CREDIT_SMALL ×30  ·  CREDIT_MEDIUM ×20  ·  CREDIT_LARGE ×10',
    penalty: '—',
    color: Colors.textMuted,
  },
  1: {
    label: 'RIFT I',
    effect: 'Shift toward frequent small wins. Best for credit farming.',
    weights: 'CREDIT_SMALL +5 → ×35  ·  CREDIT_MEDIUM +3 → ×23',
    penalty: 'EMPTY −4 → ×11',
    color: '#7B9FFF',
  },
  2: {
    label: 'RIFT II',
    effect: 'Amplify mid-tier and jackpot credit rewards.',
    weights: 'CREDIT_MEDIUM +8 → ×28  ·  CREDIT_LARGE +5 → ×15',
    penalty: 'EMPTY −5 → ×10',
    color: Colors.accent,
  },
  3: {
    label: 'RIFT III',
    effect: 'Maximize jackpot probability. High risk, high reward.',
    weights: 'CREDIT_LARGE +12 → ×22  ·  CREDIT_MEDIUM +6 → ×26',
    penalty: 'CREDIT_SMALL −10 → ×20  ·  EMPTY −8 → ×7',
    color: Colors.primary,
  },
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
  const { definition, msRemaining, activeAnomaly } = useAnomalyStore();

  function handleSelect(tier: TemporalRiftTier) {
    const rawCost = RIFT_COSTS[tier];
    const actualCost = anomalyService.applyToRiftCost(rawCost);
    if (credits >= actualCost) setRiftTier(tier);
  }

  const tiers: TemporalRiftTier[] = [0, 1, 2, 3];

  const activeDetails = RIFT_DETAILS[riftTier];
  const activeCost = anomalyService.applyToRiftCost(RIFT_COSTS[riftTier]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>TEMPORAL RIFT</Text>
        <Text style={styles.subtitle}>You choose the rift before each spin. Cost is deducted on press.</Text>
      </View>

      {/* Next spin callout */}
      <View style={[styles.nextSpinBanner, { borderColor: activeDetails.color + '88' }]}>
        <View style={styles.nextSpinRow}>
          <Text style={styles.nextSpinLabel}>NEXT SPIN USES</Text>
          <Text style={[styles.nextSpinTier, { color: activeDetails.color }]}>{activeDetails.label}</Text>
          <Text style={styles.nextSpinCost}>
            {activeCost > 0 ? `−${activeCost} CR` : 'FREE'}
          </Text>
        </View>
        <Text style={styles.nextSpinEffect}>{activeDetails.effect}</Text>
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
        <SectorTrailMap
          startedAt={activeAnomaly?.startedAt ?? null}
          currentAnomalyId={activeAnomaly?.id ?? null}
          msRemaining={msRemaining}
        />

        <Text style={styles.sectionHeader}>ALL RIFT TIERS</Text>

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
                      {actualCost} CR / spin
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.effectText}>{details.effect}</Text>
              {tier > 0 && (
                <View style={styles.weightBlock}>
                  <Text style={[styles.weightRow, { color: Colors.success }]}>↑ {details.weights}</Text>
                  <Text style={[styles.weightRow, { color: Colors.danger }]}>↓ {details.penalty}</Text>
                </View>
              )}
            </Pressable>
          );
        })}

        <Text style={styles.footnote}>
          Rifts are not on a schedule — you pick the tier before each spin.
          Cost is deducted the moment you press SPIN. If you can't afford the
          active tier, it auto-resets to Tier 0.
        </Text>

        {/* ── Anomaly catalog ── */}
        <Text style={[styles.sectionHeader, { marginTop: Spacing.lg }]}>SECTOR ANOMALIES</Text>
        <Text style={styles.anomalyCatalogNote}>
          A new anomaly activates every 4 hours. The next one is drawn at random — odds below.
          Active anomaly is shown at the top of this screen.
        </Text>
        {ANOMALY_ORDER.map((id) => {
          const def = ANOMALIES[id];
          const isCurrent = definition?.id === id;
          return (
            <View
              key={id}
              style={[styles.anomalyCard, isCurrent && { borderColor: def.color }]}
            >
              <View style={styles.anomalyCardHeader}>
                <View style={[styles.anomalyDot, { backgroundColor: def.color }]} />
                <Text style={[styles.anomalyCardName, { color: isCurrent ? def.color : Colors.textSecondary }]}>
                  {def.name}
                </Text>
                {isCurrent && (
                  <View style={[styles.activeBadge, { backgroundColor: def.color }]}>
                    <Text style={styles.activeBadgeText}>ACTIVE</Text>
                  </View>
                )}
                <View style={styles.chanceBadge}>
                  <Text style={styles.chanceText}>{ANOMALY_CHANCE[id]}</Text>
                </View>
              </View>
              <Text style={styles.anomalyCardDesc}>{def.description}</Text>
              {/* Show specific modifiers */}
              <View style={styles.anomalyModRow}>
                {def.creditMultiplier !== 1 && (
                  <Text style={[styles.anomalyMod, { color: def.creditMultiplier > 1 ? Colors.credits : Colors.danger }]}>
                    CR ×{def.creditMultiplier}
                  </Text>
                )}
                {def.attackMultiplier !== 1 && (
                  <Text style={[styles.anomalyMod, { color: def.attackMultiplier > 1 ? Colors.attack : Colors.textMuted }]}>
                    ATK ×{def.attackMultiplier}
                  </Text>
                )}
                {def.shieldBonus > 0 && (
                  <Text style={[styles.anomalyMod, { color: Colors.shield }]}>
                    +{def.shieldBonus} SHIELD/spin
                  </Text>
                )}
                {def.raidLootBonus > 0 && (
                  <Text style={[styles.anomalyMod, { color: Colors.raid }]}>
                    RAID +{Math.round(def.raidLootBonus * 100)}%
                  </Text>
                )}
                {def.riftCostMultiplier < 1 && (
                  <Text style={[styles.anomalyMod, { color: Colors.accent }]}>
                    RIFT cost ×{def.riftCostMultiplier}
                  </Text>
                )}
                {def.id === 'CALM' && (
                  <Text style={[styles.anomalyMod, { color: Colors.textMuted }]}>No modifiers</Text>
                )}
              </View>
            </View>
          );
        })}
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
  nextSpinBanner: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    backgroundColor: Colors.surfaceElevated,
    gap: 4,
  },
  nextSpinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  nextSpinLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  nextSpinTier: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  nextSpinCost: {
    fontSize: Typography.sizes.xs,
    color: Colors.credits,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  nextSpinEffect: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
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
  weightBlock: {
    marginTop: 4,
    gap: 2,
  },
  weightRow: {
    fontSize: 10,
    letterSpacing: 0.5,
    lineHeight: 15,
  },
  footnote: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
  anomalyCatalogNote: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    lineHeight: 17,
    marginBottom: Spacing.sm,
  },
  anomalyCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    gap: 4,
    marginBottom: Spacing.sm,
  },
  anomalyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  anomalyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  anomalyCardName: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  anomalyCardDesc: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  anomalyModRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: 2,
  },
  anomalyMod: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  chanceBadge: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chanceText: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 1,
    fontWeight: Typography.weights.bold,
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
