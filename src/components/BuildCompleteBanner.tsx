import { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useHabitatStore } from '@/store/useHabitatStore';
import { BuildingType } from '@/models/Habitat';
import { hapticBuildComplete } from '@/constants/haptics';
import { soundService } from '@/services/SoundService';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const BUILDING_META: Record<BuildingType, { icon: string; label: string; color: string }> = {
  GENERATOR: { icon: '⚡', label: 'GENERATOR', color: Colors.credits },
  ARMORY:    { icon: '⚔', label: 'ARMORY',    color: Colors.attack },
  VAULT:     { icon: '◈', label: 'VAULT',      color: Colors.shield },
  TURRET:    { icon: '◎', label: 'TURRET',     color: Colors.accent },
  HANGAR:    { icon: '▲', label: 'HANGAR',     color: Colors.primary },
  BARRACKS:  { icon: '◉', label: 'BARRACKS',  color: Colors.success },
};

export function BuildCompleteBanner() {
  const completedBuilding = useHabitatStore((s) => s.completedBuilding);
  const buildingLevels    = useHabitatStore((s) => s.buildingLevels);
  const clearCompleted    = useHabitatStore((s) => s.clearCompletedBuilding);

  const [display, setDisplay] = useState<{ type: BuildingType; level: number } | null>(null);

  const translateY = useSharedValue(-100);
  const opacity    = useSharedValue(0);
  const timerRef   = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!completedBuilding) return;

    hapticBuildComplete();
    void soundService.play('buildComplete');
    setDisplay({ type: completedBuilding, level: buildingLevels[completedBuilding] ?? 1 });
    clearTimeout(timerRef.current);

    translateY.value = -100;
    opacity.value    = 0;
    translateY.value = withSpring(0, { damping: 18, stiffness: 240 });
    opacity.value    = withTiming(1, { duration: 180 });

    timerRef.current = setTimeout(() => {
      translateY.value = withTiming(-100, { duration: 280 });
      opacity.value    = withTiming(0, { duration: 280 }, (done) => {
        if (done) runOnJS(clearCompleted)();
      });
    }, 3200);

    return () => clearTimeout(timerRef.current);
  }, [completedBuilding]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  if (!display) return null;

  const meta = BUILDING_META[display.type];

  return (
    <Animated.View
      style={[styles.banner, { borderColor: meta.color + '99' }, animStyle]}
      pointerEvents="none"
    >
      <Text style={styles.icon}>{meta.icon}</Text>
      <View style={styles.textGroup}>
        <Text style={[styles.label, { color: meta.color }]}>{meta.label} COMPLETE</Text>
        <Text style={styles.sub}>Upgraded to Level {display.level}</Text>
      </View>
      <Text style={[styles.levelBadge, { color: meta.color }]}>LVL {display.level}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 56,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    zIndex: 300,
  },
  icon: {
    fontSize: Typography.sizes.xl,
  },
  textGroup: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  sub: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  levelBadge: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
});
