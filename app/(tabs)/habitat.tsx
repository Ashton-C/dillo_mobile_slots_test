import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { BuildingType, BUILDING_UPGRADE_COST, BUILD_DURATION_MS } from '@/models/Habitat';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const BUILDING_META: Record<BuildingType, { icon: string; label: string; desc: string }> = {
  GENERATOR: { icon: '⚡', label: 'GENERATOR', desc: 'Passive credit income' },
  ARMORY:    { icon: '⚔', label: 'ARMORY',    desc: 'Increases max attacks' },
  VAULT:     { icon: '◈', label: 'VAULT',      desc: 'Reduces raid losses' },
  TURRET:    { icon: '◎', label: 'TURRET',     desc: 'Auto-blocks 1 attack/day' },
  HANGAR:    { icon: '▲', label: 'HANGAR',     desc: 'Unlocks drone mercenaries' },
};

const ALL_BUILDINGS: BuildingType[] = ['GENERATOR', 'ARMORY', 'VAULT', 'TURRET', 'HANGAR'];

function formatTimer(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

interface BuildingCardProps {
  type: BuildingType;
  level: number;
  canAfford: boolean;
  upgradeCost: number;
  isBuilding: boolean;
  builderBusy: boolean;
  msRemaining: number;
  totalBuildMs: number;
  onUpgrade: () => void;
}

function BuildingCard({
  type, level, canAfford, upgradeCost, isBuilding, builderBusy, msRemaining, totalBuildMs, onUpgrade,
}: BuildingCardProps) {
  const meta = BUILDING_META[type];
  const maxed = level >= 10;
  const blocked = builderBusy && !isBuilding;

  let buttonLabel: string;
  let buttonDisabled: boolean;

  if (maxed) {
    buttonLabel = 'MAX';
    buttonDisabled = true;
  } else if (isBuilding) {
    buttonLabel = formatTimer(msRemaining);
    buttonDisabled = true;
  } else if (blocked) {
    buttonLabel = 'BUSY';
    buttonDisabled = true;
  } else {
    buttonLabel = `${upgradeCost} CR`;
    buttonDisabled = !canAfford;
  }

  return (
    <View style={[styles.card, isBuilding && styles.cardActive]}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardIcon}>{meta.icon}</Text>
        <View style={styles.cardInfo}>
          <Text style={styles.cardLabel}>{meta.label}</Text>
          <Text style={styles.cardDesc}>{meta.desc}</Text>
          {isBuilding && totalBuildMs > 0 && (
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.max(2, (1 - msRemaining / totalBuildMs) * 100)}%` }]} />
            </View>
          )}
        </View>
      </View>
      <View style={styles.cardRight}>
        <Text style={[styles.cardLevel, level === 0 ? styles.cardLevelEmpty : undefined]}>
          {level === 0 ? 'NEW' : `LVL ${level}`}
        </Text>
        <Pressable
          onPress={onUpgrade}
          disabled={buttonDisabled}
          style={[
            styles.upgradeButton,
            isBuilding && styles.upgradeButtonBuilding,
            buttonDisabled && !isBuilding && styles.upgradeButtonDisabled,
          ]}
        >
          <Text style={[styles.upgradeButtonText, isBuilding && styles.upgradeButtonTextBuilding]}>
            {buttonLabel}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function HabitatScreen() {
  const { credits, subtractCredits } = useGameStore();
  const { buildingLevels, activeBuildJob, msUntilComplete, startBuild } = useHabitatStore();

  const builderBusy = activeBuildJob !== null;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>OUTPOST</Text>
        <Text style={styles.subtitle}>Build. Defend. Expand.</Text>
      </View>

      <View style={styles.statusRow}>
        <View style={styles.creditsBadge}>
          <Text style={styles.creditsValue}>{credits.toLocaleString()}</Text>
          <Text style={styles.creditsLabel}> CR</Text>
        </View>
        <View style={[styles.builderBadge, builderBusy && styles.builderBadgeBusy]}>
          <Text style={[styles.builderText, builderBusy && styles.builderTextBusy]}>
            {builderBusy ? `BUILDING · ${formatTimer(msUntilComplete)}` : 'BUILDER READY'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.sectionHeader}>STRUCTURES</Text>

        {ALL_BUILDINGS.map((type) => {
          const level = buildingLevels[type] ?? 0;
          const upgradeCost = BUILDING_UPGRADE_COST[type](level === 0 ? 1 : level);
          const isBuilding = activeBuildJob?.type === type;
          const targetLevel = level + 1;
          const totalBuildMs = BUILD_DURATION_MS[targetLevel] ?? 0;

          return (
            <BuildingCard
              key={type}
              type={type}
              level={level}
              canAfford={credits >= upgradeCost}
              upgradeCost={upgradeCost}
              isBuilding={isBuilding}
              builderBusy={builderBusy}
              msRemaining={isBuilding ? msUntilComplete : 0}
              totalBuildMs={totalBuildMs}
              onUpgrade={() => startBuild(type, subtractCredits)}
            />
          );
        })}

        <Text style={styles.footnote}>
          One builder drone active at a time. Higher levels take longer to construct.
          Builder Slots (parallel construction) coming in a future update.
        </Text>
      </ScrollView>
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
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  creditsBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  creditsValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.credits,
  },
  creditsLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  builderBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  builderBadgeBusy: {
    borderColor: Colors.accent,
  },
  builderText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  builderTextBusy: {
    color: Colors.accent,
    fontWeight: Typography.weights.bold,
  },
  list: { padding: Spacing.md, gap: Spacing.sm },
  sectionHeader: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
    marginBottom: Spacing.xs,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  cardActive: {
    borderColor: Colors.accent,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  cardIcon: {
    fontSize: Typography.sizes.xl,
    width: 32,
    textAlign: 'center',
  },
  cardInfo: {
    flex: 1,
    gap: 2,
  },
  cardLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  cardDesc: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
  },
  progressTrack: {
    height: 2,
    backgroundColor: Colors.border,
    borderRadius: 1,
    marginTop: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.accent,
    borderRadius: 1,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  cardLevel: {
    fontSize: Typography.sizes.xs,
    color: Colors.accent,
    letterSpacing: 2,
  },
  cardLevelEmpty: {
    color: Colors.textMuted,
  },
  upgradeButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    minWidth: 64,
    alignItems: 'center',
  },
  upgradeButtonBuilding: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  upgradeButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
  },
  upgradeButtonText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  upgradeButtonTextBuilding: {
    color: Colors.accent,
  },
  footnote: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
});
