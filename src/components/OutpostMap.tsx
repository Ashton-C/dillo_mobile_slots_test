import { View, Text, StyleSheet, Pressable, Image, ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect, useMemo, useState } from 'react';
import { useHabitatStore } from '@/store/useHabitatStore';
import { BuildingType } from '@/models/Habitat';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const TAN_30 = Math.tan(Math.PI / 6); // ≈ 0.5774
const ISO_STEP = 26;

const BUILDING_META: Record<BuildingType, { icon: ImageSourcePropType; label: string; color: string }> = {
  GENERATOR: { icon: require('../../assets/buildings/generator.png'), label: 'GEN',    color: Colors.credits },
  ARMORY:    { icon: require('../../assets/buildings/armory.png'),    label: 'ARMORY', color: Colors.attack },
  VAULT:     { icon: require('../../assets/buildings/vault.png'),     label: 'VAULT',  color: Colors.shield },
  TURRET:    { icon: require('../../assets/buildings/turret.png'),    label: 'TURRET', color: Colors.accent },
  HANGAR:    { icon: require('../../assets/buildings/hangar.png'),    label: 'HANGAR', color: Colors.primary },
  BARRACKS:  { icon: require('../../assets/buildings/barracks.png'),  label: 'BRCKS',  color: Colors.success },
};

// Node positions as [xFraction, yFraction] of the map container
const NODE_POSITIONS: Record<BuildingType | 'OUTPOST', [number, number]> = {
  OUTPOST:   [0.50, 0.44],
  GENERATOR: [0.20, 0.22],
  ARMORY:    [0.80, 0.22],
  VAULT:     [0.10, 0.54],
  TURRET:    [0.90, 0.54],
  HANGAR:    [0.28, 0.76],
  BARRACKS:  [0.72, 0.76],
};

const ALL_BUILDINGS: BuildingType[] = ['GENERATOR', 'ARMORY', 'VAULT', 'TURRET', 'HANGAR', 'BARRACKS'];
const OUTPOST_SIZE = 84;
const NODE_SIZE = 66;

function formatTimer(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

interface PulseRingProps { color: string; size: number }
function PulseRing({ color, size }: PulseRingProps) {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(0.8);

  useEffect(() => {
    scale.value   = withRepeat(withSequence(withTiming(1.5, { duration: 900 }), withTiming(1, { duration: 900 })), -1);
    opacity.value = withRepeat(withSequence(withTiming(0.2, { duration: 900 }), withTiming(0.8, { duration: 900 })), -1);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: BorderRadius.sm, borderWidth: 2, borderColor: color },
        style,
      ]}
    />
  );
}

interface ConnectionLineProps {
  x1: number; y1: number;
  x2: number; y2: number;
}

function ConnectionLine({ x1, y1, x2, y2 }: ConnectionLineProps) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle  = Math.atan2(dy, dx) * (180 / Math.PI);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: cx - length / 2,
        top: cy - 0.5,
        width: length,
        height: 1,
        backgroundColor: Colors.accent + '30',
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

interface OutpostMapProps {
  onTapBuilding: (type: BuildingType) => void;
  onTapOutpost:  () => void;
}

export function OutpostMapInteractive({ onTapBuilding, onTapOutpost }: OutpostMapProps) {
  const [dims, setDims] = useState({ w: 0, h: 0 });
  const buildingLevels  = useHabitatStore((s) => s.buildingLevels);
  const outpostLevel    = useHabitatStore((s) => s.outpostLevel);
  const activeBuildJob  = useHabitatStore((s) => s.activeBuildJob);
  const msUntilComplete = useHabitatStore((s) => s.msUntilComplete);

  const nodeCoords = (key: BuildingType | 'OUTPOST') => {
    const [fx, fy] = NODE_POSITIONS[key];
    return { x: fx * dims.w, y: fy * dims.h };
  };

  const isoLines = useMemo(() => {
    if (dims.w === 0) return [] as { left: number; top: number; width: number; angle: number }[];
    const dy = dims.w * TAN_30;
    const length = Math.sqrt(dims.w * dims.w + dy * dy);
    const angleA = Math.atan2(dy, dims.w) * (180 / Math.PI);
    const angleB = -angleA;
    const lines: { left: number; top: number; width: number; angle: number }[] = [];
    for (let y0 = -dy; y0 < dims.h + ISO_STEP; y0 += ISO_STEP) {
      const cxA = dims.w / 2;
      const cyA = y0 + dy / 2;
      lines.push({ left: cxA - length / 2, top: cyA - 0.25, width: length, angle: angleA });
      const cyB = y0 - dy / 2;
      lines.push({ left: cxA - length / 2, top: cyB - 0.25, width: length, angle: angleB });
    }
    return lines;
  }, [dims.w, dims.h]);

  return (
    <View
      style={styles.container}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setDims({ w: width, h: height });
      }}
    >
      {isoLines.map((ln, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: ln.left,
            top: ln.top,
            width: ln.width,
            height: 0.5,
            backgroundColor: Colors.info + '18',
            transform: [{ rotate: `${ln.angle}deg` }],
          }}
        />
      ))}

      {dims.w > 0 && ALL_BUILDINGS.map((type) => {
        const outpost = nodeCoords('OUTPOST');
        const node    = nodeCoords(type);
        return (
          <ConnectionLine key={type} x1={outpost.x} y1={outpost.y} x2={node.x} y2={node.y} />
        );
      })}

      <LinearGradient colors={[Colors.background, Colors.background + '00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[styles.fade, { left: 0, top: 0, bottom: 0, width: 48 }]} pointerEvents="none" />
      <LinearGradient colors={[Colors.background + '00', Colors.background]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={[styles.fade, { right: 0, top: 0, bottom: 0, width: 48 }]} pointerEvents="none" />
      <LinearGradient colors={[Colors.background, Colors.background + '00']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={[styles.fade, { top: 0, left: 0, right: 0, height: 40 }]} pointerEvents="none" />
      <LinearGradient colors={[Colors.background + '00', Colors.background]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
        style={[styles.fade, { bottom: 0, left: 0, right: 0, height: 40 }]} pointerEvents="none" />

      {dims.w > 0 && (
        <>
          {ALL_BUILDINGS.map((type) => {
            const { x, y } = nodeCoords(type);
            const level = buildingLevels[type] ?? 0;
            const color = BUILDING_META[type].color;
            const isBuilding = activeBuildJob?.type === type && !activeBuildJob.isOutpost;
            const isUnbuilt  = level === 0;
            const isGated    = !isUnbuilt && (level + 1) > outpostLevel;
            const halfSize   = NODE_SIZE / 2;

            return (
              <View
                key={type}
                pointerEvents="box-none"
                style={[styles.nodeContainer, { left: x - halfSize, top: y - halfSize, width: NODE_SIZE, height: NODE_SIZE }]}
              >
                <Pressable
                  style={[styles.nodeBadge, { width: NODE_SIZE, height: NODE_SIZE, borderColor: color + (isUnbuilt ? '44' : 'CC'), backgroundColor: color + (isUnbuilt ? '0A' : '1E') }]}
                  onPress={() => onTapBuilding(type)}
                >
                  {isBuilding && <PulseRing color={color} size={NODE_SIZE} />}
                  {isGated && <View style={styles.lockIndicator}><Text style={styles.lockText}>▲</Text></View>}
                  <Image
                    source={BUILDING_META[type].icon}
                    style={[styles.nodeImage, isUnbuilt && styles.nodeIconDim]}
                    resizeMode="contain"
                  />
                  <Text style={[styles.nodeLevel, { color: isUnbuilt ? Colors.textMuted : color }]}>{isUnbuilt ? '—' : `${level}`}</Text>
                </Pressable>
                <Text style={[styles.nodeLabel, { color: isUnbuilt ? Colors.textMuted : color + 'CC' }]}>{BUILDING_META[type].label}</Text>
                {isBuilding && <Text style={[styles.buildTimer, { color }]}>{formatTimer(msUntilComplete)}</Text>}
              </View>
            );
          })}

          {/* OUTPOST node */}
          {(() => {
            const { x, y } = nodeCoords('OUTPOST');
            const isUpgrading = activeBuildJob?.isOutpost === true;
            const halfSize = OUTPOST_SIZE / 2;
            return (
              <View
                pointerEvents="box-none"
                style={[styles.nodeContainer, { left: x - halfSize, top: y - halfSize, width: OUTPOST_SIZE, height: OUTPOST_SIZE }]}
              >
                <Pressable
                  style={[styles.nodeBadge, { width: OUTPOST_SIZE, height: OUTPOST_SIZE, borderColor: Colors.accent + 'CC', backgroundColor: Colors.accent + '22' }]}
                  onPress={onTapOutpost}
                >
                  {isUpgrading && <PulseRing color={Colors.accent} size={OUTPOST_SIZE} />}
                  <Text style={styles.nodeIcon}>◎</Text>
                  <Text style={[styles.nodeLevel, { color: Colors.accent }]}>{outpostLevel}</Text>
                </Pressable>
                <Text style={[styles.nodeLabel, { color: Colors.accent + 'CC' }]}>OUTPOST</Text>
                {isUpgrading && <Text style={[styles.buildTimer, { color: Colors.accent }]}>{formatTimer(msUntilComplete)}</Text>}
              </View>
            );
          })()}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  fade: {
    position: 'absolute',
    zIndex: 2,
  },
  nodeContainer: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 5,
  },
  nodeBadge: {
    borderRadius: BorderRadius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  nodeIcon: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
  },
  nodeImage: {
    width: NODE_SIZE - 14,
    height: NODE_SIZE - 14,
  },
  nodeIconDim: {
    opacity: 0.4,
  },
  nodeLevel: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  nodeLabel: {
    fontSize: 8,
    letterSpacing: 1.5,
    marginTop: 3,
    fontWeight: Typography.weights.bold,
  },
  buildTimer: {
    fontSize: 8,
    letterSpacing: 0.5,
    marginTop: 1,
    fontWeight: Typography.weights.bold,
  },
  lockIndicator: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  lockText: {
    fontSize: 8,
    color: Colors.danger,
  },
});
