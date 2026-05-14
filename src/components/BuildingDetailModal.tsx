import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { DroneMarketplace } from '@/components/DroneMarketplace';
import { SkipBuildModal } from '@/components/SkipBuildModal';
import { useState } from 'react';
import { hapticBuildStart } from '@/constants/haptics';
import { soundService } from '@/services/SoundService';
import { BuildingType, BUILDING_UPGRADE_COST, getBuildDurationMs, LEVEL_HARD_CAP, LEVEL_SOFT_CAP } from '@/models/Habitat';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const BUILDING_META: Record<BuildingType, { icon: string; label: string }> = {
  GENERATOR: { icon: '⚡', label: 'GENERATOR' },
  ARMORY:    { icon: '⚔', label: 'ARMORY' },
  VAULT:     { icon: '◈', label: 'VAULT' },
  TURRET:    { icon: '◎', label: 'TURRET' },
  HANGAR:    { icon: '▲', label: 'HANGAR' },
  BARRACKS:  { icon: '◉', label: 'BARRACKS' },
};

const BUILDING_COLOR: Record<BuildingType, string> = {
  GENERATOR: Colors.credits,
  ARMORY:    Colors.attack,
  VAULT:     Colors.shield,
  TURRET:    Colors.accent,
  HANGAR:    Colors.primary,
  BARRACKS:  Colors.success,
};

interface BuildingDetail {
  summary: string;
  mechanic: string;
  nextSummary: string | null;
}

const BUILDING_DETAIL: Record<BuildingType, (level: number) => BuildingDetail> = {
  GENERATOR: (l) => {
    const ocBonus = l * 40 + 100;
    return {
      summary:    l === 0 ? 'No passive income yet' : `+${l * 20} CR / 30s  ·  ${l * 40} CR/min`,
      mechanic:   l === 0
        ? 'Earns credits every 30s. Each level adds +20 CR/tick.'
        : `OVERCLOCK bonus at LVL ${l}: +${ocBonus} CR flat per spin`,
      nextSummary: l < 10
        ? `+${(l + 1) * 20} CR/30s  ·  OVERCLOCK +${(l + 1) * 40 + 100} CR`
        : null,
    };
  },
  ARMORY: (l) => ({
    summary:    l === 0 ? 'Base storage: 50 fuel cells' : `Max ${50 + l * 5} fuel cells stored`,
    mechanic:   l === 0
      ? 'Raises the fuel cell storage cap. 1 fuel cell = 1 OVERCLOCK charge.'
      : '1 fuel cell consumed per OVERCLOCK activation',
    nextSummary: l < 10 ? `Max ${50 + (l + 1) * 5} fuel cells` : null,
  }),
  VAULT: (l) => {
    const stealPct = (30 * (1 - Math.min(l * 0.05, 0.5))).toFixed(1);
    const nextSteal = (30 * (1 - Math.min((l + 1) * 0.05, 0.5))).toFixed(1);
    return {
      summary:    l === 0 ? 'Raiders steal 30% of your credits' : `Raiders steal ${stealPct}% of credits`,
      mechanic:   l === 0
        ? 'Each VAULT level cuts raid loot by 1.5pp · base = 30% · max protection 50% at LVL 10'
        : `${l * 5}% of base loot absorbed · max 50% protection at LVL 10`,
      nextSummary: l < 10 ? `Raiders steal ${nextSteal}% of credits` : null,
    };
  },
  TURRET: (l) => ({
    summary:    l === 0 ? 'No auto-defense' : `Auto-blocks ${l} attack${l !== 1 ? 's' : ''}/day`,
    mechanic:   l === 0
      ? 'Automatically blocks incoming attacks before any credits are lost. No shields required.'
      : 'Blocked attacks steal no credits · ignores shields · charges reset daily',
    nextSummary: l < 10 ? `Auto-blocks ${l + 1} attack${l + 1 !== 1 ? 's' : ''}/day` : null,
  }),
  HANGAR: (l) => ({
    summary:    l === 0 ? 'No drone slots' : `${l} drone slot${l !== 1 ? 's' : ''} online`,
    mechanic:   l === 0
      ? 'Each level adds 1 contract slot. Drones grant credit multipliers & bonuses.'
      : `Deploy ${l} mercenary contract${l !== 1 ? 's' : ''} simultaneously`,
    nextSummary: l < 10 ? `${l + 1} drone slot${l + 1 !== 1 ? 's' : ''}` : null,
  }),
  BARRACKS: (l) => ({
    summary:    l === 0 ? 'Base capacity: 50 spins' : `Max ${50 + l * 5} spins stored`,
    mechanic:   l === 0
      ? 'Raises the maximum spin storage cap. Spins refill at 1 per 5 min regardless.'
      : `${l * 5} bonus spin slots · refill rate unchanged`,
    nextSummary: l < 10 ? `Max ${50 + (l + 1) * 5} spins stored` : null,
  }),
};

function formatTimer(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

interface Props {
  type: BuildingType | null;
  onClose: () => void;
}

export function BuildingDetailModal({ type, onClose }: Props) {
  const { credits, subtractCredits } = useGameStore();
  const { buildingLevels, outpostLevel, activeBuildJob, msUntilComplete, completedBuilding, startBuild } = useHabitatStore();
  const [contractsVisible, setContractsVisible] = useState(false);
  const [skipVisible, setSkipVisible] = useState(false);

  // All Reanimated hooks must be called unconditionally before any early return
  const iconOpacity  = useSharedValue(1);
  const ringScale    = useSharedValue(0.6);
  const ringOpacity  = useSharedValue(0);
  const floatY       = useSharedValue(0);
  const floatOpacity = useSharedValue(0);
  const floatScale   = useSharedValue(0.5);

  const level       = type ? (buildingLevels[type] ?? 0) : 0;
  const color       = type ? BUILDING_COLOR[type] : Colors.textMuted;
  const isBuilding  = type ? (activeBuildJob?.type === type && !activeBuildJob.isOutpost) : false;
  const isCompleted = type ? completedBuilding === type : false;

  useEffect(() => {
    if (!type) return;
    if (isBuilding) {
      iconOpacity.value = withRepeat(
        withSequence(withTiming(0.4, { duration: 600 }), withTiming(1, { duration: 600 })),
        -1,
      );
    } else {
      iconOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isBuilding, type]);

  useEffect(() => {
    if (!isCompleted) return;
    ringScale.value   = 0.6;
    ringOpacity.value = 0;
    ringScale.value   = withTiming(2.8, { duration: 700 });
    ringOpacity.value = withSequence(
      withTiming(0.9, { duration: 80 }),
      withDelay(200, withTiming(0, { duration: 450 })),
    );
    floatY.value       = 0;
    floatScale.value   = 0;
    floatOpacity.value = 0;
    floatScale.value   = withSpring(1, { damping: 9, stiffness: 200 });
    floatY.value       = withTiming(-56, { duration: 900 });
    floatOpacity.value = withSequence(
      withTiming(1, { duration: 100 }),
      withDelay(500, withTiming(0, { duration: 320 })),
    );
  }, [isCompleted]);

  const iconAnimStyle = useAnimatedStyle(() => ({ opacity: iconOpacity.value }));
  const ringStyle     = useAnimatedStyle(() => ({ transform: [{ scale: ringScale.value }], opacity: ringOpacity.value }));
  const floatStyle    = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }, { scale: floatScale.value }], opacity: floatOpacity.value }));

  // Safe to early-return here — all hooks have been called above
  if (!type) return null;

  const meta         = BUILDING_META[type];
  const detail       = BUILDING_DETAIL[type](level);
  const upgradeCost  = BUILDING_UPGRADE_COST[type](level === 0 ? 1 : level);
  const builderBusy  = activeBuildJob !== null;
  const maxed        = level >= LEVEL_HARD_CAP;
  const blocked      = builderBusy && !isBuilding;
  const gatedByOutpost = !maxed && (level + 1) > outpostLevel;
  const totalBuildMs = getBuildDurationMs(level + 1);
  const progressPct  = totalBuildMs > 0 ? Math.max(2, (1 - msUntilComplete / totalBuildMs) * 100) : 0;
  // Levels 1–10 fill the 10-dot bar; past 10 every level is "prestige" and we
  // show the bar fully lit with a "+N" suffix instead.
  const cappedDots   = Math.min(level, LEVEL_SOFT_CAP);
  const levelDots    = Array.from({ length: LEVEL_SOFT_CAP }, (_, i) => i < cappedDots ? '●' : '○').join('');
  const prestige     = Math.max(0, level - LEVEL_SOFT_CAP);

  let buttonLabel: string;
  let buttonDisabled: boolean;
  let buttonColor = color;

  if (maxed) {
    buttonLabel = 'FULLY UPGRADED'; buttonDisabled = true;
  } else if (isBuilding) {
    buttonLabel = `BUILDING  ${formatTimer(msUntilComplete)}`; buttonDisabled = true;
  } else if (gatedByOutpost) {
    buttonLabel = `OUTPOST LVL ${level + 1} REQUIRED`; buttonDisabled = true; buttonColor = Colors.textMuted;
  } else if (blocked) {
    buttonLabel = 'BUILDER BUSY'; buttonDisabled = true;
  } else {
    buttonLabel = `UPGRADE  ${upgradeCost.toLocaleString()} CR`; buttonDisabled = !credits || credits < upgradeCost;
  }

  return (
    <Modal visible={!!type} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.card}>
            <LinearGradient
              colors={[color + 'AA', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              style={styles.cardStripe}
            />
            <View style={styles.cardBody}>
              <View style={styles.iconWrap}>
                <Animated.View style={[styles.iconBadge, { borderColor: color, backgroundColor: color + '18' }, iconAnimStyle]}>
                  <Text style={styles.cardIcon}>{meta.icon}</Text>
                </Animated.View>
                <Animated.View pointerEvents="none" style={[styles.completionRing, { borderColor: color }, ringStyle]} />
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
                <Text style={[styles.cardEffect, { color }]}>{detail.summary}</Text>
                <Text style={styles.cardMechanic}>{detail.mechanic}</Text>
                {!maxed && detail.nextSummary !== null && (
                  <Text style={styles.cardNextLevel}>→ LVL {level + 1}: {detail.nextSummary}</Text>
                )}
                <Text style={[styles.levelDots, { color }]}>
                  {levelDots}
                  {prestige > 0 ? ` +${prestige}` : ''}
                </Text>
              </View>
            </View>

            {isBuilding && totalBuildMs > 0 && (
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progressPct}%`, backgroundColor: color }]} />
              </View>
            )}

            <Pressable
              onPress={() => { hapticBuildStart(); void soundService.play('buildStart'); startBuild(type, subtractCredits); }}
              disabled={buttonDisabled}
              style={[
                styles.upgradeButton,
                isBuilding ? [styles.upgradeButtonBuilding, { borderColor: color }]
                  : gatedByOutpost ? styles.upgradeButtonGated
                  : buttonDisabled ? styles.upgradeButtonDisabled
                  : { backgroundColor: buttonColor },
              ]}
            >
              <Text style={[
                styles.upgradeButtonText,
                isBuilding ? { color } : gatedByOutpost ? { color: Colors.textMuted } : buttonDisabled ? { color: Colors.textMuted } : { color: Colors.background },
              ]}>
                {buttonLabel}
              </Text>
            </Pressable>
          </View>

          {isBuilding && (
            <Pressable onPress={() => setSkipVisible(true)} style={styles.contractsBtn}>
              <Text style={[styles.contractsBtnText, { color: Colors.accent }]}>⚡  FINISH NOW</Text>
            </Pressable>
          )}

          {type === 'HANGAR' && level > 0 && (
            <Pressable onPress={() => setContractsVisible(true)} style={styles.contractsBtn}>
              <Text style={styles.contractsBtnText}>▲  DRONE CONTRACTS</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>

      <DroneMarketplace visible={contractsVisible} onClose={() => setContractsVisible(false)} />
      <SkipBuildModal visible={skipVisible} onClose={() => setSkipVisible(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingBottom: Spacing.xxl,
    gap: Spacing.sm,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginTop: Spacing.sm, marginBottom: Spacing.xs },

  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, marginHorizontal: Spacing.md, overflow: 'hidden' },
  cardStripe: { height: 3, width: '100%' },
  cardBody: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  iconWrap: { width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center' },
  iconBadge: { width: 48, height: 48, borderRadius: BorderRadius.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  completionRing: { position: 'absolute', width: 48, height: 48, borderRadius: BorderRadius.sm, borderWidth: 2 },
  floatLabel: { position: 'absolute', top: 0, alignItems: 'center' },
  floatLabelText: { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, letterSpacing: 2 },
  cardIcon: { fontSize: Typography.sizes.xl },
  cardInfo: { flex: 1, gap: 3 },
  cardTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardLabel: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, color: Colors.textPrimary, letterSpacing: 2 },
  cardLevel: { fontSize: Typography.sizes.xs, letterSpacing: 2 },
  cardEffect: { fontSize: Typography.sizes.xs, letterSpacing: 0.5 },
  cardMechanic: { fontSize: 10, color: Colors.textMuted, letterSpacing: 0.3 },
  cardNextLevel: { fontSize: 9, color: Colors.textMuted + '88', letterSpacing: 0.3 },
  levelDots: { fontSize: 9, letterSpacing: 2, marginTop: 1 },

  progressTrack: { height: 3, backgroundColor: Colors.border, marginHorizontal: Spacing.md, marginBottom: Spacing.sm, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },

  upgradeButton: { marginHorizontal: Spacing.md, marginBottom: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center', backgroundColor: Colors.surfaceElevated },
  upgradeButtonBuilding: { backgroundColor: Colors.surfaceElevated, borderWidth: 1 },
  upgradeButtonGated: { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border },
  upgradeButtonDisabled: { backgroundColor: Colors.surfaceElevated },
  upgradeButtonText: { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, letterSpacing: 2 },

  contractsBtn: { marginHorizontal: Spacing.md, backgroundColor: Colors.primary + '22', borderWidth: 1, borderColor: Colors.primary + '55', borderRadius: BorderRadius.sm, paddingVertical: Spacing.md, alignItems: 'center' },
  contractsBtnText: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, color: Colors.primary, letterSpacing: 2 },
});
