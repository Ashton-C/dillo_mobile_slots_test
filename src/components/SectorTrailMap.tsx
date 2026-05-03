import { useEffect, Fragment } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { AnomalyId, ANOMALIES } from '@/services/AnomalyService';

// ── Anomaly helpers ───────────────────────────────────────────────────────────

const ANOMALY_IDS: AnomalyId[] = [
  'SOLAR_SURGE', 'VOID_STORM', 'CREDIT_BLOOM', 'SHIELD_PULSE', 'RAID_SHADOW', 'CALM',
];
const ANOMALY_POOL: AnomalyId[] = ANOMALY_IDS.flatMap(id =>
  id === 'CALM' ? [id] : [id, id],
);
const ANOMALY_DURATION_MS = 4 * 60 * 60 * 1000;

const ANOMALY_SHORT: Record<AnomalyId, string> = {
  SOLAR_SURGE:  'SURGE',
  VOID_STORM:   'STORM',
  CREDIT_BLOOM: 'BLOOM',
  SHIELD_PULSE: 'PULSE',
  RAID_SHADOW:  'SHADOW',
  CALM:         'CALM',
};

function mixSeed(ts: number): number {
  const period = Math.floor(ts / ANOMALY_DURATION_MS);
  let h = 0;
  const s = period.toString(16);
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function makeSectorName(seed: number): string {
  const letters = ['A', 'B', 'G', 'D', 'K', 'Z', 'S', 'T', 'N', 'X'];
  const num = ((seed >>> 4) % 99) + 1;
  return `SEC-${letters[seed % letters.length]}${num < 10 ? '0' + num : num}`;
}

function anomalyFromSeed(seed: number): AnomalyId {
  return ANOMALY_POOL[seed % ANOMALY_POOL.length];
}

function formatMs(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ── Sector data ───────────────────────────────────────────────────────────────

interface SectorNode {
  name: string;
  anomalyId: AnomalyId | null;
  isCurrent: boolean;
  isPast: boolean;
  isNext: boolean;
}

function buildNodes(startedAt: number | null, currentId: AnomalyId | null): SectorNode[] {
  const base = startedAt ?? Date.now();
  const nodes: SectorNode[] = [];

  for (let n = 3; n >= 1; n--) {
    const seed = mixSeed(base - n * ANOMALY_DURATION_MS);
    nodes.push({
      name: makeSectorName(seed),
      anomalyId: anomalyFromSeed(seed),
      isCurrent: false,
      isPast: true,
      isNext: false,
    });
  }

  nodes.push({
    name: makeSectorName(mixSeed(base)),
    anomalyId: currentId,
    isCurrent: true,
    isPast: false,
    isNext: false,
  });

  nodes.push({
    name: '???',
    anomalyId: null,
    isCurrent: false,
    isPast: false,
    isNext: true,
  });

  return nodes;
}

// ── Layout constants ──────────────────────────────────────────────────────────

const MAP_W = Dimensions.get('window').width - 32;
const MAP_H = 260;

// Winding 2D path — [x_fraction, y_fraction]
const NODE_FRACS: [number, number][] = [
  [0.10, 0.38],
  [0.28, 0.70],
  [0.50, 0.28],
  [0.70, 0.62],
  [0.88, 0.30],
];

const CURRENT_IDX = 3;

function nodeXY(i: number): { x: number; y: number } {
  return {
    x: Math.round(NODE_FRACS[i][0] * MAP_W),
    y: Math.round(NODE_FRACS[i][1] * MAP_H),
  };
}

// ── Isometric grid lines ──────────────────────────────────────────────────────
// Two families of parallel diagonal lines at +30° and –30°, creating the
// classic iso-floor "holographic grid" look without any SVG.

const ISO_STEP = 22;
const ISO_COLOR = Colors.info + '20';

function IsoGrid({ width, height }: { width: number; height: number }) {
  const tan30 = Math.tan(Math.PI / 6); // ≈ 0.5774
  const dy = width * tan30;

  const lines: { x1: number; y1: number; x2: number; y2: number; k: string }[] = [];

  // +30° family: from (0, y1) → (width, y1 + dy)
  for (let y1 = -dy; y1 <= height + ISO_STEP; y1 += ISO_STEP) {
    lines.push({ x1: 0, y1, x2: width, y2: y1 + dy, k: `p${Math.round(y1)}` });
  }
  // –30° family: from (0, y1) → (width, y1 - dy)
  for (let y1 = -ISO_STEP; y1 <= height + dy + ISO_STEP; y1 += ISO_STEP) {
    lines.push({ x1: 0, y1, x2: width, y2: y1 - dy, k: `n${Math.round(y1)}` });
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {lines.map(({ x1, y1, x2, y2, k }) => {
        const dx = x2 - x1;
        const ddy = y2 - y1;
        const len = Math.sqrt(dx * dx + ddy * ddy);
        const angle = Math.atan2(ddy, dx) * (180 / Math.PI);
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        return (
          <View
            key={k}
            style={{
              position: 'absolute',
              left: cx - len / 2,
              top: cy - 0.25,
              width: len,
              height: 0.5,
              backgroundColor: ISO_COLOR,
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        );
      })}
    </View>
  );
}

// ── Path line ─────────────────────────────────────────────────────────────────

function PathLine({
  x1, y1, x2, y2, color, opacity, thick,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; opacity: number; thick?: boolean;
}) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  const h = thick ? 2 : 1;
  return (
    <View
      style={{
        position: 'absolute',
        left: cx - len / 2,
        top: cy - h / 2,
        width: len,
        height: h,
        backgroundColor: color,
        opacity,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  startedAt: number | null;
  currentAnomalyId: AnomalyId | null;
  msRemaining: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SectorTrailMap({ startedAt, currentAnomalyId, msRemaining }: Props) {
  const nodes = buildNodes(startedAt, currentAnomalyId);
  const curDef   = currentAnomalyId ? ANOMALIES[currentAnomalyId] : null;
  const curColor = curDef?.color ?? Colors.accent;
  const cur      = nodeXY(CURRENT_IDX);

  const blink  = useSharedValue(1);
  const floatY = useSharedValue(0);
  const glowS  = useSharedValue(1);
  const glowO  = useSharedValue(0.5);

  useEffect(() => {
    blink.value = withRepeat(withSequence(
      withTiming(0.15, { duration: 800 }),
      withTiming(1,    { duration: 800 }),
    ), -1);

    floatY.value = withRepeat(withSequence(
      withTiming(-6, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      withTiming(0,  { duration: 1100, easing: Easing.inOut(Easing.quad) }),
    ), -1);

    glowS.value = withRepeat(withSequence(
      withTiming(2.6, { duration: 1300, easing: Easing.out(Easing.quad) }),
      withTiming(1,   { duration: 1300, easing: Easing.in(Easing.quad) }),
    ), -1);

    glowO.value = withRepeat(withSequence(
      withTiming(0,   { duration: 1300 }),
      withTiming(0.5, { duration: 1300 }),
    ), -1);
  }, []);

  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.value }));
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: floatY.value }] }));
  const glowStyle  = useAnimatedStyle(() => ({
    transform: [{ scale: glowS.value }],
    opacity: glowO.value,
  }));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>FLIGHT PATH</Text>
        {msRemaining > 0 && (
          <Text style={styles.timerText}>NEXT SECTOR  {formatMs(msRemaining)}</Text>
        )}
      </View>

      {/* Map canvas — overflow:hidden clips the gradient fades cleanly */}
      <View style={{ width: MAP_W, height: MAP_H, overflow: 'hidden', borderRadius: BorderRadius.md }}>

        {/* Subtle holographic surface tint */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: Colors.info + '06' }]} />

        {/* ISO grid (two families of diagonal lines = 3D floor) */}
        <IsoGrid width={MAP_W} height={MAP_H} />

        {/* Path glow underlays (thick, low opacity behind each segment) */}
        {nodes.slice(0, -1).map((_, i) => {
          const p1 = nodeXY(i), p2 = nodeXY(i + 1);
          const isToCurrent = i === CURRENT_IDX - 1;
          if (!isToCurrent) return null;
          return (
            <PathLine
              key={`glow_${i}`}
              x1={p1.x} y1={p1.y}
              x2={p2.x} y2={p2.y}
              color={curColor}
              opacity={0.12}
              thick
            />
          );
        })}

        {/* Path lines */}
        {nodes.slice(0, -1).map((_, i) => {
          const p1 = nodeXY(i), p2 = nodeXY(i + 1);
          const isToCurrent = i === CURRENT_IDX - 1;
          const isToNext    = i === CURRENT_IDX;
          const color = isToCurrent ? curColor : Colors.textMuted;
          const opacity = isToCurrent ? 0.75 : isToNext ? 0.18 : 0.38;
          return (
            <PathLine
              key={i}
              x1={p1.x} y1={p1.y}
              x2={p2.x} y2={p2.y}
              color={color}
              opacity={opacity}
            />
          );
        })}

        {/* Glow ring behind current node */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: cur.x - 22,
              top: cur.y - 22,
              width: 44,
              height: 44,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: curColor,
            },
            glowStyle,
          ]}
        />

        {/* Ship icon — floating above current node */}
        <Animated.Text
          style={[
            styles.shipIcon,
            { color: curColor, left: cur.x - 6, top: cur.y - 44 },
            floatStyle,
          ]}
        >
          ▲
        </Animated.Text>

        {/* Sector nodes + labels */}
        {nodes.map((node, i) => {
          const { x, y } = nodeXY(i);
          const def   = node.anomalyId ? ANOMALIES[node.anomalyId] : null;
          const color = node.isCurrent
            ? curColor
            : node.isNext
            ? Colors.textMuted
            : def?.color ?? Colors.textMuted;

          const size = node.isCurrent ? 42 : 26;
          const half = size / 2;
          const alpha = node.isPast ? '18' : node.isCurrent ? '30' : '10';
          // Labels below node, but push above for nodes in lower half of canvas
          const labelAbove = node.isPast && NODE_FRACS[i][1] > 0.55;
          const labelTop   = node.isCurrent
            ? y + half + 5
            : node.isNext
            ? y + 15
            : labelAbove
            ? y - half - 22
            : y + half + 5;

          return (
            <Fragment key={i}>
              {node.isNext ? (
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      left: x - 13,
                      top: y - 13,
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      borderWidth: 1,
                      borderStyle: 'dashed' as const,
                      borderColor: Colors.textMuted,
                      backgroundColor: Colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                    blinkStyle,
                  ]}
                >
                  <Text style={styles.nextQ}>?</Text>
                </Animated.View>
              ) : (
                <View
                  style={{
                    position: 'absolute',
                    left: x - half,
                    top: y - half,
                    width: size,
                    height: size,
                    borderRadius: node.isCurrent ? 10 : half,
                    borderWidth: node.isCurrent ? 2 : 1,
                    borderColor: color,
                    backgroundColor: color + alpha,
                    opacity: node.isPast ? 0.5 : 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {node.isCurrent && (
                    <>
                      {/* Inner ring */}
                      <View
                        style={{
                          width: size * 0.55,
                          height: size * 0.55,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: color + 'AA',
                        }}
                      />
                    </>
                  )}
                </View>
              )}

              <Text
                style={[
                  styles.sectorName,
                  {
                    left: x - 32,
                    top: labelTop,
                    color: node.isCurrent ? Colors.textPrimary : Colors.textMuted,
                    opacity: node.isPast ? 0.55 : node.isNext ? 0.35 : 1,
                  },
                ]}
                numberOfLines={1}
              >
                {node.name}
              </Text>

              {node.anomalyId && def && (
                <Text
                  style={[
                    styles.anomalyTag,
                    {
                      left: x - 28,
                      top: labelAbove ? y - half - 10 : node.isCurrent ? y + half + 19 : y + half + 18,
                      color,
                      opacity: node.isPast ? 0.6 : 1,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {ANOMALY_SHORT[node.anomalyId]}
                </Text>
              )}
            </Fragment>
          );
        })}

        {/* Edge fade-off overlays — left, right, top, bottom */}
        <LinearGradient
          colors={[Colors.surface, Colors.surface + '00']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 64 }}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[Colors.surface + '00', Colors.surface]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 64 }}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[Colors.surface, Colors.surface + '00']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 55 }}
          pointerEvents="none"
        />
        <LinearGradient
          colors={[Colors.surface + '00', Colors.surface]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 55 }}
          pointerEvents="none"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.info + '35',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
    alignItems: 'center',
    overflow: 'hidden',
    shadowColor: Colors.info,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  header: {
    width: MAP_W,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  headerLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.info,
    letterSpacing: 3,
    opacity: 0.7,
  },
  timerText: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  shipIcon: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: '700',
  },
  nextQ: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  sectorName: {
    position: 'absolute',
    width: 64,
    textAlign: 'center',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  anomalyTag: {
    position: 'absolute',
    width: 56,
    textAlign: 'center',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
