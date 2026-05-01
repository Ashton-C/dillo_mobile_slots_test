import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticBuildStart } from '@/constants/haptics';
import { LegendCard, LegendSection, LegendRow, LegendNote } from '@/components/LegendCard';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { DroneMarketplace } from '@/components/DroneMarketplace';
import { BuildingType, BUILDING_UPGRADE_COST, BUILD_DURATION_MS, outpostUpgradeCost, outpostUpgradeDuration } from '@/models/Habitat';
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
  outpostLevel: number;
  canAfford: boolean;
  upgradeCost: number;
  isBuilding: boolean;
  builderBusy: boolean;
  msRemaining: number;
  totalBuildMs: number;
  isCompleted: boolean;
  onUpgrade: () => void;
}

function BuildingCard({
  type, level, outpostLevel, canAfford, upgradeCost, isBuilding, builderBusy, msRemaining, totalBuildMs, isCompleted, onUpgrade,
}: BuildingCardProps) {
  const color = BUILDING_COLOR[type];
  const meta = BUILDING_META[type];
  const maxed = level >= 10;
  const blocked = builderBusy && !isBuilding;
  const gatedByOutpost = !maxed && (level + 1) > outpostLevel;

  const iconOpacity = useSharedValue(1);
  useEffect(() => {
    if (isBuilding) {
      iconOpacity.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 600 }), withTiming(1, { duration: 600 })),
        -1,
      );
    } else {
      iconOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isBuilding]);
  const iconAnimStyle = useAnimatedStyle(() => ({ opacity: iconOpacity.value }));

  const ringScale   = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);
  const floatY      = useSharedValue(0);
  const floatOpacity = useSharedValue(0);
  const floatScale  = useSharedValue(0.5);

  useEffect(() => {
    if (!isCompleted) return;
    ringScale.value   = 0.6;
    ringOpacity.value = 0;
    ringScale.value   = withTiming(2.8, { duration: 700 });
    ringOpacity.value = withSequence(
      withTiming(0.9, { duration: 80 }),
      withDelay(200, withTiming(0, { duration: 450 })),
    );
    floatY.value      = 0;
    floatScale.value  = 0;
    floatOpacity.value = 0;
    floatScale.value  = withSpring(1, { damping: 9, stiffness: 200 });
    floatY.value      = withTiming(-56, { duration: 900 });
    floatOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(500, withTiming(0, { duration: 320 })),
    );
  }, [isCompleted]);

  const ringStyle  = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }, { scale: floatScale.value }],
    opacity: floatOpacity.value,
  }));

  let buttonLabel: string;
  let buttonDisabled: boolean;
  let buttonColor: string = color;

  if (maxed) {
    buttonLabel = 'FULLY UPGRADED';
    buttonDisabled = true;
  } else if (isBuilding) {
    buttonLabel = `BUILDING  ${formatTimer(msRemaining)}`;
    buttonDisabled = true;
  } else if (gatedByOutpost) {
    buttonLabel = `OUTPOST LVL ${level + 1} REQUIRED`;
    buttonDisabled = true;
    buttonColor = Colors.textMuted;
  } else if (blocked) {
    buttonLabel = 'BUILDER BUSY';
    buttonDisabled = true;
  } else {
    buttonLabel = `UPGRADE  ${upgradeCost.toLocaleString()} CR`;
    buttonDisabled = !canAfford;
  }

  const progressPct = totalBuildMs > 0 ? Math.max(2, (1 - msRemaining / totalBuildMs) * 100) : 0;
  const levelDots = Array.from({ length: 10 }, (_, i) => i < level ? '●' : '○').join('');

  function handlePress() {
    hapticBuildStart();
    onUpgrade();
  }

  return (
    <View style={[styles.card, { borderColor: isBuilding ? color : Colors.border }]}>
      <LinearGradient
        colors={[color + 'AA', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardStripe}
      />
      <View style={styles.cardBody}>
        <View style={styles.iconWrap}>
          <Animated.View style={[styles.iconBadge, { borderColor: color, backgroundColor: color + '18' }, iconAnimStyle]}>
            <Text style={styles.cardIcon}>{meta.icon}</Text>
          </Animated.View>
          {/* Completion ring burst */}
          <Animated.View
            pointerEvents="none"
            style={[styles.completionRing, { borderColor: color }, ringStyle]}
          />
          {/* Floating level label */}
          <Animated.View pointerEvents="none" style={[styles.floatLabel, floatStyle]}>
            <Text style={[styles.floatLabelText, { color }]}>+LVL {level}</Text>
          </Animated.View>
        </View>
        <View style={styles.cardInfo}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardLabel}>{meta.label}</Text>
            <Text style={[styles.cardLevel, { color: level === 0 ? Colors.textMuted : color }]}>
              {level === 0 ? 'NEW' : `LVL ${level}`}
            </Text>
          </View>
          <Text style={[styles.cardEffect, { color }]}>{BUILDING_EFFECT[type](level)}</Text>
          <Text style={[styles.levelDots, { color }]}>{levelDots}</Text>
        </View>
      </View>

      {isBuilding && totalBuildMs > 0 && (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: color }]} />
        </View>
      )}

      <Pressable
        onPress={handlePress}
        disabled={buttonDisabled}
        style={[
          styles.upgradeButton,
          isBuilding
            ? [styles.upgradeButtonBuilding, { borderColor: color }]
            : gatedByOutpost
              ? styles.upgradeButtonGated
              : buttonDisabled
                ? styles.upgradeButtonDisabled
                : { backgroundColor: buttonColor },
        ]}
      >
        <Text style={[
          styles.upgradeButtonText,
          isBuilding      ? { color }                   :
          gatedByOutpost  ? { color: Colors.textMuted } :
          buttonDisabled  ? { color: Colors.textMuted } :
                            { color: Colors.background },
        ]}>
          {buttonLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export default function HabitatScreen() {
  const { credits, subtractCredits } = useGameStore();
  const { buildingLevels, outpostLevel, activeBuildJob, msUntilComplete, completedBuilding, startBuild, upgradeOutpost } = useHabitatStore();
  const [contractsVisible, setContractsVisible] = useState(false);
  const [legendVisible, setLegendVisible] = useState(false);

  const builderBusy = activeBuildJob !== null;
  const isUpgradingOutpost = activeBuildJob?.isOutpost === true;
  const hangarLevel = buildingLevels['HANGAR'] ?? 0;

  const outpostCost = outpostUpgradeCost(outpostLevel);
  const outpostDuration = outpostUpgradeDuration(outpostLevel + 1);
  const outpostMaxed = outpostLevel >= 10;

  return (
    <SafeAreaView style={styles.root}>

      {/* Outpost level banner */}
      <LinearGradient
        colors={[Colors.gradientEnd + '44', Colors.gradientStart + '22', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.outpostBanner}
      >
        <View style={styles.outpostLeft}>
          <Text style={styles.outpostTitle}>OUTPOST</Text>
          <View style={styles.outpostLevelRow}>
            <Text style={styles.outpostLevelNum}>{outpostLevel}</Text>
            <Text style={styles.outpostLevelMax}> / 10</Text>
          </View>
          <Text style={styles.outpostHint}>
            {outpostMaxed ? 'Fully upgraded' : `Buildings capped at level ${outpostLevel}`}
          </Text>
        </View>

        <View style={styles.outpostRight}>
          {!outpostMaxed && (
            isUpgradingOutpost ? (
              <View style={styles.outpostBuildingBadge}>
                <Text style={styles.outpostBuildingText}>
                  UPGRADING  {formatTimer(msUntilComplete)}
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  hapticBuildStart();
                  upgradeOutpost(subtractCredits);
                }}
                disabled={builderBusy || credits < outpostCost}
                style={[
                  styles.outpostButton,
                  (builderBusy || credits < outpostCost) && styles.outpostButtonDisabled,
                ]}
              >
                <Text style={styles.outpostButtonCost}>{outpostCost.toLocaleString()} CR</Text>
                <Text style={styles.outpostButtonSub}>{formatTimer(outpostDuration)}</Text>
              </Pressable>
            )
          )}
        </View>
      </LinearGradient>

      <View style={styles.statusRow}>
        <View style={styles.creditsBadge}>
          <Text style={styles.creditsValue}>{credits.toLocaleString()}</Text>
          <Text style={styles.creditsLabel}> CR</Text>
        </View>
        {builderBusy && !isUpgradingOutpost && (
          <View style={styles.builderBadge}>
            <Text style={styles.builderText}>
              BUILDING · {formatTimer(msUntilComplete)}
            </Text>
          </View>
        )}
        {!builderBusy && (
          <View style={[styles.builderBadge, styles.builderBadgeIdle]}>
            <Text style={styles.builderTextIdle}>◎ BUILDER READY</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.sectionHeader}>STRUCTURES</Text>

        {ALL_BUILDINGS.map((type) => {
          const level = buildingLevels[type] ?? 0;
          const upgradeCost = BUILDING_UPGRADE_COST[type](level === 0 ? 1 : level);
          const isBuilding = activeBuildJob?.type === type && !activeBuildJob.isOutpost;
          const targetLevel = level + 1;
          const totalBuildMs = BUILD_DURATION_MS[targetLevel] ?? 0;

          return (
            <BuildingCard
              key={type}
              type={type}
              level={level}
              outpostLevel={outpostLevel}
              canAfford={credits >= upgradeCost}
              upgradeCost={upgradeCost}
              isBuilding={isBuilding}
              builderBusy={builderBusy}
              msRemaining={isBuilding ? msUntilComplete : 0}
              totalBuildMs={totalBuildMs}
              isCompleted={completedBuilding === type}
              onUpgrade={() => startBuild(type, subtractCredits)}
            />
          );
        })}

        {hangarLevel > 0 && (
          <Pressable
            onPress={() => setContractsVisible(true)}
            style={styles.contractsButton}
          >
            <LinearGradient
              colors={[Colors.primary + '33', Colors.accent + '22']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.contractsGradient}
            >
              <Text style={styles.contractsIcon}>▲</Text>
              <View>
                <Text style={styles.contractsLabel}>DRONE CONTRACTS</Text>
                <Text style={styles.contractsSub}>Hire mercenary drones · HANGAR LVL {hangarLevel}</Text>
              </View>
              <Text style={styles.contractsChevron}>›</Text>
            </LinearGradient>
          </Pressable>
        )}

        <Text style={styles.footnote}>
          One builder drone active at a time. Buildings are capped by Outpost level.
          Higher levels take longer to construct.
        </Text>
      </ScrollView>

      <DroneMarketplace visible={contractsVisible} onClose={() => setContractsVisible(false)} />

      <Pressable style={styles.legendBtn} onPress={() => setLegendVisible(true)} hitSlop={12}>
        <Text style={styles.legendBtnText}>?</Text>
      </Pressable>

      <LegendCard visible={legendVisible} onDismiss={() => setLegendVisible(false)} title="BASE LEGEND" accentColor={Colors.credits}>
        <LegendSection label="BUILDINGS" />
        <LegendRow left="GENERATOR" right="Passive +level×20 CR / 30s" color={Colors.credits} />
        <LegendRow left="ARMORY" right="Raises Fuel Cell cap" color={Colors.attack} />
        <LegendRow left="VAULT" right="Absorbs level×5% raid loss" color={Colors.shield} />
        <LegendRow left="TURRET" right="Auto-blocks N attacks/day" color={Colors.accent} />
        <LegendRow left="HANGAR" right="Unlocks drone contract slots" color={Colors.primary} />
        <LegendSection label="RULES" />
        <LegendRow left="Outpost Level gates all buildings" />
        <LegendRow left="One active build job at a time" />
        <LegendNote text="Build timers count down while the app is closed. Higher tiers take significantly longer." />
      </LegendCard>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  outpostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  outpostLeft: { gap: 2 },
  outpostTitle: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 4,
  },
  outpostLevelRow: { flexDirection: 'row', alignItems: 'baseline' },
  outpostLevelNum: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.accent,
  },
  outpostLevelMax: {
    fontSize: Typography.sizes.md,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  outpostHint: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  outpostRight: { alignItems: 'flex-end' },
  outpostButton: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    minWidth: 100,
  },
  outpostButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  outpostButtonCost: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  outpostButtonSub: {
    fontSize: 10,
    color: Colors.textPrimary + 'AA',
    letterSpacing: 1,
  },
  outpostBuildingBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  outpostBuildingText: {
    fontSize: Typography.sizes.xs,
    color: Colors.accent,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  creditsBadge: { flexDirection: 'row', alignItems: 'baseline' },
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
    borderColor: Colors.accent,
    backgroundColor: Colors.surfaceElevated,
  },
  builderBadgeIdle: {
    borderColor: Colors.border,
  },
  builderText: {
    fontSize: Typography.sizes.xs,
    color: Colors.accent,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  builderTextIdle: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
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
  cardStripe: { height: 3, width: '100%' },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  iconWrap: {
    width: 48,
    height: 48,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completionRing: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
  },
  floatLabel: {
    position: 'absolute',
    top: 0,
    alignItems: 'center',
  },
  floatLabelText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  cardIcon: { fontSize: Typography.sizes.xl },
  cardInfo: { flex: 1, gap: 3 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  cardLevel: { fontSize: Typography.sizes.xs, letterSpacing: 2 },
  cardEffect: { fontSize: Typography.sizes.xs, letterSpacing: 0.5 },
  levelDots: { fontSize: 9, letterSpacing: 2, marginTop: 1 },

  progressTrack: {
    height: 3,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },

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
  upgradeButtonGated: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  upgradeButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
  },
  upgradeButtonText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },

  contractsButton: {
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.primary + '55',
    marginTop: Spacing.xs,
  },
  contractsGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  contractsIcon: {
    fontSize: Typography.sizes.xl,
    color: Colors.primary,
    width: 32,
    textAlign: 'center',
  },
  contractsLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
    letterSpacing: 2,
  },
  contractsSub: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  contractsChevron: {
    marginLeft: 'auto',
    fontSize: Typography.sizes.xl,
    color: Colors.textMuted,
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
