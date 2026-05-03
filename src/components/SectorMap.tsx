import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
  cancelAnimation,
} from 'react-native-reanimated';
import { Colors, Typography, BorderRadius } from '@/constants/theme';
import { PlayerIndexEntry } from '@/services/FirestoreService';

const MAP_SIZE = Math.min(Dimensions.get('window').width - 32, 320);
const CENTER = MAP_SIZE / 2;
const RING_RADII = [MAP_SIZE * 0.22, MAP_SIZE * 0.38, MAP_SIZE * 0.48];

// Stable pseudo-random position from a uid string
function uidToPosition(uid: string, index: number): { angle: number; radius: number } {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  }
  // Use index offset to spread multiple targets apart
  const angleStep = (Math.PI * 2) / 8;
  const angleOffset = ((hash >>> 8) % 8) * angleStep + index * (Math.PI / 4);
  const radius = RING_RADII[hash % RING_RADII.length];
  return { angle: angleOffset, radius };
}

function threatColor(outpostLevel: number, myOutpostLevel: number): string {
  const diff = myOutpostLevel - outpostLevel;
  if (diff >= 2) return Colors.success;
  if (diff >= 0) return Colors.warning;
  return Colors.danger;
}

// Draws a thin line between two points using transform: rotate
function TravelLine({
  x1, y1, x2, y2, color, active,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; active: boolean;
}) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;

  return (
    <View
      style={{
        position: 'absolute',
        left: cx - length / 2,
        top: cy - 1,
        width: length,
        height: active ? 2 : 1,
        backgroundColor: color,
        opacity: active ? 0.65 : 0.2,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

// Single target blip with pulse animation when active
function TargetBlip({
  x, y, color, label, active, dimmed,
}: {
  x: number; y: number; color: string; label: string;
  active: boolean; dimmed: boolean;
}) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (active) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.5, { duration: 500, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 500, easing: Easing.in(Easing.quad) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [active]);

  const blipStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: dimmed ? 0.35 : 1,
  }));

  const BLIP = active ? 10 : 7;

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: x - BLIP,
          top: y - BLIP,
          width: BLIP * 2,
          height: BLIP * 2,
          borderRadius: BLIP,
          backgroundColor: color + '33',
          borderWidth: active ? 2 : 1,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        },
        blipStyle,
      ]}
    >
      <Text style={{ fontSize: 6, color, fontWeight: '700', letterSpacing: 0.5 }} numberOfLines={1}>
        {label.slice(0, 3)}
      </Text>
    </Animated.View>
  );
}

// Hex-grid background drawn as rings of dots
function HexGrid() {
  const dots: { x: number; y: number }[] = [];
  const STEP = 22;
  const half = CENTER;
  for (let gx = -half; gx <= half; gx += STEP) {
    for (let gy = -half; gy <= half; gy += STEP) {
      const dist = Math.sqrt(gx * gx + gy * gy);
      if (dist <= half - 4) {
        dots.push({ x: CENTER + gx, y: CENTER + gy });
      }
    }
  }
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dots.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: d.x - 1,
            top: d.y - 1,
            width: 2,
            height: 2,
            borderRadius: 1,
            backgroundColor: Colors.accent + '22',
          }}
        />
      ))}
    </View>
  );
}

interface Props {
  targets: PlayerIndexEntry[];
  recentTargets: PlayerIndexEntry[];
  myOutpostLevel: number;
  selectedUid?: string | null;
  isScanning: boolean;
}

export function SectorMap({ targets, recentTargets, myOutpostLevel, selectedUid, isScanning }: Props) {
  const sweepAngle = useSharedValue(0);
  const sweepOpacity = useSharedValue(0);
  const pingScale = useSharedValue(0);
  const pingOpacity = useSharedValue(0);

  const prevScanningRef = useRef(false);

  // Continuous slow rotation
  useEffect(() => {
    sweepAngle.value = withRepeat(
      withTiming(360, { duration: 4000, easing: Easing.linear }),
      -1,
    );
  }, []);

  // Scan ping pulse on new scan
  useEffect(() => {
    if (isScanning && !prevScanningRef.current) {
      sweepOpacity.value = withSequence(
        withTiming(0.7, { duration: 120 }),
        withTiming(0.4, { duration: 400 }),
        withTiming(0.25, { duration: 600 }),
      );
      pingScale.value = 0;
      pingOpacity.value = 0;
      pingScale.value = withTiming(1.4, { duration: 900, easing: Easing.out(Easing.quad) });
      pingOpacity.value = withSequence(
        withTiming(0.6, { duration: 150 }),
        withTiming(0, { duration: 700 }),
      );
    } else if (!isScanning && prevScanningRef.current) {
      sweepOpacity.value = withTiming(0.25, { duration: 400 });
    }
    prevScanningRef.current = isScanning;
  }, [isScanning]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${sweepAngle.value}deg` }],
    opacity: sweepOpacity.value,
  }));

  const pingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pingScale.value }],
    opacity: pingOpacity.value,
  }));

  // Combine live + recent targets, deduped
  const allTargets = [
    ...targets,
    ...recentTargets.filter((r) => !targets.some((t) => t.uid === r.uid)),
  ];

  return (
    <View style={styles.container}>
      {/* Map area */}
      <View style={[styles.map, { width: MAP_SIZE, height: MAP_SIZE, borderRadius: MAP_SIZE / 2 }]}>
        <HexGrid />

        {/* Range rings */}
        {RING_RADII.map((r, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: CENTER - r,
              top: CENTER - r,
              width: r * 2,
              height: r * 2,
              borderRadius: r,
              borderWidth: 1,
              borderColor: Colors.accent + (i === 0 ? '44' : i === 1 ? '33' : '22'),
            }}
          />
        ))}

        {/* Travel lines from player to each target */}
        {allTargets.map((t, i) => {
          const { angle, radius } = uidToPosition(t.uid, i);
          const tx = CENTER + Math.cos(angle) * radius;
          const ty = CENTER + Math.sin(angle) * radius;
          const color = threatColor(t.outpostLevel, myOutpostLevel);
          const isActive = t.uid === selectedUid;
          return (
            <TravelLine
              key={t.uid}
              x1={CENTER} y1={CENTER}
              x2={tx} y2={ty}
              color={color}
              active={isActive}
            />
          );
        })}

        {/* Target blips */}
        {allTargets.map((t, i) => {
          const { angle, radius } = uidToPosition(t.uid, i);
          const tx = CENTER + Math.cos(angle) * radius;
          const ty = CENTER + Math.sin(angle) * radius;
          const color = threatColor(t.outpostLevel, myOutpostLevel);
          const isRecent = !targets.some((live) => live.uid === t.uid);
          return (
            <TargetBlip
              key={t.uid}
              x={tx}
              y={ty}
              color={color}
              label={t.displayName}
              active={t.uid === selectedUid}
              dimmed={isRecent}
            />
          );
        })}

        {/* Radar sweep wedge */}
        <Animated.View style={[StyleSheet.absoluteFill, sweepStyle]}>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: MAP_SIZE,
              height: MAP_SIZE / 2,
              borderRadius: MAP_SIZE / 2,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: MAP_SIZE / 2,
                backgroundColor: Colors.accent,
                opacity: 0.08,
                transform: [{ skewX: '60deg' }, { translateX: MAP_SIZE * 0.1 }],
              }}
            />
          </View>
          {/* Sweep leading edge */}
          <View
            style={{
              position: 'absolute',
              left: CENTER - 1,
              top: 0,
              width: 1,
              height: CENTER,
              backgroundColor: Colors.accent,
              opacity: 0.6,
            }}
          />
        </Animated.View>

        {/* Scan ping ring */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: CENTER - MAP_SIZE * 0.45,
              top: CENTER - MAP_SIZE * 0.45,
              width: MAP_SIZE * 0.9,
              height: MAP_SIZE * 0.9,
              borderRadius: MAP_SIZE * 0.45,
              borderWidth: 2,
              borderColor: Colors.accent,
            },
            pingStyle,
          ]}
        />

        {/* Player node */}
        <View style={[styles.playerNode, { left: CENTER - 10, top: CENTER - 10 }]}>
          <View style={styles.playerCore} />
        </View>
        <Text style={[styles.playerLabel, { left: CENTER + 14, top: CENTER - 6 }]}>YOU</Text>
      </View>

      {/* Legend row */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
          <Text style={styles.legendText}>WEAK</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.warning }]} />
          <Text style={styles.legendText}>EVEN</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.danger }]} />
          <Text style={styles.legendText}>STRONG</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.textMuted, opacity: 0.4 }]} />
          <Text style={[styles.legendText, { opacity: 0.4 }]}>RECENT</Text>
        </View>
        <Text style={styles.targetCount}>{targets.length > 0 ? `${targets.length} LIVE` : '—'}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 10,
  },
  map: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.accent + '44',
    overflow: 'hidden',
  },
  playerNode: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent + '33',
    borderWidth: 2,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerCore: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent,
  },
  playerLabel: {
    position: 'absolute',
    fontSize: 8,
    color: Colors.accent,
    fontWeight: '700',
    letterSpacing: 1,
  },
  legend: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  targetCount: {
    fontSize: 9,
    color: Colors.accent,
    letterSpacing: 2,
    fontWeight: '700',
    marginLeft: 'auto',
  },
});
