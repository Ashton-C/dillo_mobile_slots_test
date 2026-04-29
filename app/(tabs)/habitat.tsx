import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { BuildingType, BUILDING_UPGRADE_COST, BUILD_DURATION_MS } from '@/models/Habitat';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const BUILDING_META: Record<BuildingType, { icon: string; label: string }> = {
  GENERATOR: { icon: '⚡', label: 'GENERATOR' },
  ARMORY:    { icon: '⚔', label: 'ARMORY' },
  VAULT:     { icon: '◈', label: 'VAULT' },
  TURRET:    { icon: '◎', label: 'TURRET' },
  HANGAR:    { icon: '▲', label: 'HANGAR' },
};

const BUILDING_COLOR: Record<BuildingType, string> = {
  GENERATOR: Colors.credits,
  ARMORY:    Colors.attack,
  VAULT:     Colors.shield,
  TURRET:    Colors.accent,
  HANGAR:    Colors.primary,
};

const BUILDING_EFFECT: Record<BuildingType, (level: number) => string> = {
  GENERATOR: (l) => l === 0 ? 'Passive credit income' : `+${l * 20} CR / 30s passive`,
  ARMORY:    (l) => l === 0 ? 'Fuel cell capacity' : `Max ${50 + l * 5} fuel cells`,
  VAULT:     (l) => l === 0 ? 'Raid loss protection' : `${l * 5}% credits protected`,
  TURRET:    (l) => l === 0 ? 'Auto-defense system' : `Blocks ${l} attack${l > 1 ? 's' : ''}/day`,
  HANGAR:    (l) => l === 0 ? 'Drone bay — unlock contracts' : `${l} drone slot${l > 1 ? 's' : ''} online`,
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
  const color = BUILDING_COLOR[type];
  const meta = BUILDING_META[type];
  const maxed = level >= 10;
  const blocked = builderBusy && !isBuilding;

  const iconOpacity = useSharedValue(1);

  useEffect(() => {
    if (isBuilding) {
      iconOpacity.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 600 }),
          withTiming(1, { duration: 600 }),
        ),
        -1,
      );
    } else {
      iconOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isBuilding]);

  const iconAnimStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
  }));

  let buttonLabel: string;
  let buttonDisabled: boolean;

  if (maxed) {
    buttonLabel = 'FULLY UPGRADED';
    buttonDisabled = true;
  } else if (isBuilding) {
    buttonLabel = `BUILDING  ${formatTimer(msRemaining)}`;
    buttonDisabled = true;
  } else if (blocked) {
    buttonLabel = 'BUILDER BUSY';
    buttonDisabled = true;
  } else {
    buttonLabel = `UPGRADE  ${upgradeCost.toLocaleString()} CR`;
    buttonDisabled = !canAfford;
  }

  const progressPct = totalBuildMs > 0 ? Math.max(2, (1 - msRemaining / totalBuildMs) * 100) : 0;

  const levelDots = Array.from({ length: 10 }, (_, i) =>
    i < level ? '●' : '○'
  ).join('');

  function handlePress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onUpgrade();
  }

  return (
    <View style={[styles.card, { borderColor: isBuilding ? color : Colors.border }]}>
      {/* Top color stripe */}
      <LinearGradient
        colors={[color + 'AA', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardStripe}
      />

      {/* Main content row */}
      <View style={styles.cardBody}>
        {/* Icon badge */}
        <Animated.View style={[styles.iconBadge, { borderColor: color, backgroundColor: color + '18' }, iconAnimStyle]}>
          <Text style={styles.cardIcon}>{meta.icon}</Text>
        </Animated.View>

        {/* Info section */}
        <View style={styles.cardInfo}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardLabel}>{meta.label}</Text>
            <Text style={[styles.cardLevel, { color: level === 0 ? Colors.textMuted : color }]}>
              {level === 0 ? 'NEW' : `LVL ${level}`}
            </Text>
          </View>
          <Text style={[styles.cardEffect, { color: color }]}>
            {BUILDING_EFFECT[type](level)}
          </Text>
          <Text style={[styles.levelDots, { color: color }]}>{levelDots}</Text>
        </View>
      </View>

      {/* Build progress bar */}
      {isBuilding && totalBuildMs > 0 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: color }]} />
        </View>
      )}

      {/* Upgrade button */}
      <Pressable
        onPress={handlePress}
        disabled={buttonDisabled}
        style={[
          styles.upgradeButton,
          isBuilding
            ? [styles.upgradeButtonBuilding, { borderColor: color }]
            : buttonDisabled
              ? styles.upgradeButtonDisabled
              : { backgroundColor: color },
        ]}
      >
        <Text style={[
          styles.upgradeButtonText,
          isBuilding
            ? { color }
            : buttonDisabled
              ? { color: Colors.textMuted }
              : { color: Colors.background },
        ]}>
          {buttonLabel}
        </Text>
      </Pressable>
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
            {builderBusy ? `BUILDING · ${formatTimer(msUntilComplete)}` : '◎ BUILDER READY'}
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
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardStripe: {
    height: 3,
    width: '100%',
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  cardIcon: {
    fontSize: Typography.sizes.xl,
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  cardLevel: {
    fontSize: Typography.sizes.xs,
    letterSpacing: 2,
  },
  cardEffect: {
    fontSize: Typography.sizes.xs,
    letterSpacing: 0.5,
  },
  levelDots: {
    fontSize: 9,
    letterSpacing: 2,
    marginTop: 1,
  },
  progressTrack: {
    height: 3,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  upgradeButton: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  upgradeButtonBuilding: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
  },
  upgradeButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
  },
  upgradeButtonText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  footnote: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
});
