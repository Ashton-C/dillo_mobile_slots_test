import { View, Text, StyleSheet, Pressable, Image, ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useEffect, useMemo, useState } from 'react';
import { useHabitatStore } from '@/store/useHabitatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { BuildingType } from '@/models/Habitat';
import { HexFrame } from '@/components/HexFrame';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const TAN_30 = Math.tan(Math.PI / 6); // ≈ 0.5774
const ISO_STEP = 26;

const BUILDING_META: Record<BuildingType, { icon: ImageSourcePropType; label: string; color: string }> = {
  GENERATOR: { icon: require('../../assets/buildings/generator.png'), label: 'GEN',    color: Colors.primary  }, // orange
  ARMORY:    { icon: require('../../assets/buildings/armory.png'),    label: 'ARMORY', color: Colors.attack   }, // red
  VAULT:     { icon: require('../../assets/buildings/vault.png'),     label: 'VAULT',  color: Colors.credits  }, // yellow
  TURRET:    { icon: require('../../assets/buildings/turret.png'),    label: 'TURRET', color: Colors.shield   }, // blue
  HANGAR:    { icon: require('../../assets/buildings/hangar.png'),    label: 'HANGAR', color: Colors.accent   }, // purple
  BARRACKS:  { icon: require('../../assets/buildings/barracks.png'),  label: 'BRCKS',  color: Colors.success  }, // green
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
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }, style]}>
      <HexFrame size={size} color={color} thickness={2} />
    </Animated.View>
  );
}

interface OutpostSpireProps {
  size: number;
  color: string;
  level: number;
  pulsing: boolean;
}

const SQRT3_2 = Math.sqrt(3) / 2;

function OutpostSpire({ size, color, level, pulsing }: OutpostSpireProps) {
  const sway  = useSharedValue(0);
  const pulse = useSharedValue(0);

  useEffect(() => {
    sway.value = withRepeat(
      withSequence(
        withTiming(1,  { duration: 2400, easing: Easing.inOut(Easing.sin) }),
        withTiming(-1, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, []);

  const swayStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${sway.value * 2}deg` }],
  }));

  const beaconStyle = useAnimatedStyle(() => ({
    opacity:   0.5 + pulse.value * 0.5,
    transform: [{ scale: 1 + pulse.value * 0.5 }],
  }));

  const baseW = size * 0.86;
  const midW  = size * 0.62;
  const topW  = size * 0.42;
  const baseH = baseW * SQRT3_2;
  const midH  = midW  * SQRT3_2;
  const topH  = topW  * SQRT3_2;

  const baseBottom = 0;
  const midBottom  = baseH * 0.55;
  const topBottom  = midBottom + midH * 0.55;
  const apexBottom = topBottom + topH * 0.70;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { alignItems: 'center', justifyContent: 'flex-end' },
        swayStyle,
      ]}
    >
      <View
        style={[
          styles.spireGlow,
          {
            width: size * 1.25,
            height: size * 1.25,
            borderRadius: size * 0.625,
            bottom: -size * 0.05,
            backgroundColor: color + (pulsing ? '3A' : '1A'),
          },
        ]}
      />

      <View style={[styles.spireTierWrap, { bottom: baseBottom }]}>
        <View
          style={{
            position: 'absolute',
            bottom: -4,
            width: baseW * 0.78,
            height: 5,
            backgroundColor: color + '55',
            borderRadius: 3,
          }}
        />
        <HexFrame size={baseW} color={color} thickness={2} fillColor={color + '38'} />
      </View>

      <View style={[styles.spireTierWrap, { bottom: midBottom }]}>
        <View
          style={{
            position: 'absolute',
            bottom: -3,
            width: midW * 0.78,
            height: 4,
            backgroundColor: color + '66',
            borderRadius: 2,
          }}
        />
        <HexFrame size={midW} color={color} thickness={2} fillColor={color + '55'} />
      </View>

      <View
        style={{
          position: 'absolute',
          bottom: topBottom,
          width: topW,
          height: topH,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <HexFrame size={topW} color={color} thickness={2.5} fillColor={color + '70'} />
        <Text style={[styles.spireLevel, { color: Colors.textPrimary }]}>{level}</Text>
      </View>

      <View style={[styles.spireTierWrap, { bottom: apexBottom }]}>
        <View style={{ width: 1, height: 9, backgroundColor: color }} />
        <Animated.View
          style={[
            {
              position: 'absolute',
              bottom: 7,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: color,
            },
            beaconStyle,
          ]}
        />
      </View>
    </Animated.View>
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
  const outpostColor    = useAuthStore((s) => s.outpostColor) ?? Colors.accent;

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
            const imageSize  = NODE_SIZE * 2;
            const imageHalf  = imageSize / 2;

            return (
              <View
                key={type}
                pointerEvents="box-none"
                style={[styles.nodeContainer, { left: x - halfSize, top: y - halfSize, width: NODE_SIZE, height: NODE_SIZE }]}
              >
                <Pressable
                  style={[styles.nodeHex, { width: NODE_SIZE, height: NODE_SIZE }]}
                  onPress={() => onTapBuilding(type)}
                  hitSlop={6}
                >
                  {isBuilding && <PulseRing color={color} size={NODE_SIZE} />}
                  {isGated && <View style={styles.lockIndicator}><Text style={styles.lockText}>▲</Text></View>}
                  <Image
                    source={BUILDING_META[type].icon}
                    style={[
                      styles.nodeImageOverflow,
                      { width: imageSize, height: imageSize, left: -imageHalf + NODE_SIZE / 2, top: -imageHalf + NODE_SIZE / 2 },
                      isUnbuilt && styles.nodeIconDim,
                    ]}
                    resizeMode="contain"
                  />
                  <Text style={[styles.nodeLevelOverlay, { color: isUnbuilt ? Colors.textMuted : color }]}>
                    {isUnbuilt ? '—' : `${level}`}
                  </Text>
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
                  style={[styles.nodeHex, { width: OUTPOST_SIZE, height: OUTPOST_SIZE }]}
                  onPress={onTapOutpost}
                  hitSlop={6}
                >
                  <OutpostSpire
                    size={OUTPOST_SIZE}
                    color={outpostColor}
                    level={outpostLevel}
                    pulsing={isUpgrading}
                  />
                </Pressable>
                <Text style={[styles.nodeLabel, { color: outpostColor + 'CC' }]}>OUTPOST</Text>
                {isUpgrading && <Text style={[styles.buildTimer, { color: outpostColor }]}>{formatTimer(msUntilComplete)}</Text>}
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
    overflow: 'visible',
  },
  nodeHex: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  nodeImageOverflow: {
    position: 'absolute',
  },
  nodeIconDim: {
    opacity: 0.4,
  },
  nodeLevelOverlay: {
    position: 'absolute',
    bottom: -8,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 1,
    backgroundColor: Colors.background + 'EE',
    borderRadius: 8,
    overflow: 'hidden',
  },
  nodeLabel: {
    fontSize: 15,
    letterSpacing: 1.5,
    marginTop: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: Colors.background + 'E6',
    borderRadius: 6,
    overflow: 'hidden',
    fontWeight: Typography.weights.bold,
  },
  buildTimer: {
    fontSize: Typography.sizes.sm,
    letterSpacing: 0.5,
    marginTop: 2,
    fontWeight: Typography.weights.bold,
  },
  lockIndicator: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  lockText: {
    fontSize: Typography.sizes.sm,
    color: Colors.danger,
  },
  spireGlow: {
    position: 'absolute',
  },
  spireTierWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  spireLevel: {
    position: 'absolute',
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
});
