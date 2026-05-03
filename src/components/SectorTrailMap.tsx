import { useEffect, Fragment } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
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

// Map canvas fills the scroll content area (scroll has 16px padding each side)
const MAP_W = Dimensions.get('window').width - 32;
const MAP_H = 230;

// Winding 2D path — [x_fraction, y_fraction] of MAP_W × MAP_H
// Zigzags from left → right creating a natural exploration route
const NODE_FRACS: [number, number][] = [
  [0.10, 0.38],  // past-3: left, mid-upper
  [0.28, 0.70],  // past-2: left-center, lower
  [0.50, 0.28],  // past-1: center, upper
  [0.70, 0.62],  // current: right-center, lower
  [0.88, 0.30],  // next: far right, upper
];

const CURRENT_IDX = 3;

function nodeXY(i: number): { x: number; y: number } {
  return {
    x: Math.round(NODE_FRACS[i][0] * MAP_W),
    y: Math.round(NODE_FRACS[i][1] * MAP_H),
  };
}

// ── Hex dot background ────────────────────────────────────────────────────────

const HEX_STEP = 17;
const HEX_ROW_H = HEX_STEP * 0.866;

function HexGrid({ width, height }: { width: number; height: number }) {
  const dots: { x: number; y: number }[] = [];
  let row = 0;
  while (row * HEX_ROW_H < height) {
    let col = 0;
    while (col * HEX_STEP < width + HEX_STEP) {
      dots.push({
        x: col * HEX_STEP + (row % 2 === 1 ? HEX_STEP / 2 : 0),
        y: row * HEX_ROW_H,
      });
      col++;
    }
    row++;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {dots.map((d, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: d.x - 1.5,
            top: d.y - 1.5,
            width: 3,
            height: 3,
            borderRadius: 1.5,
            backgroundColor: Colors.accent + '28',
          }}
        />
      ))}
    </View>
  );
}

// ── Path line (rotated thin view) ─────────────────────────────────────────────

function PathLine({
  x1, y1, x2, y2, color, opacity,
}: {
  x1: number; y1: number; x2: number; y2: number;
  color: string; opacity: number;
}) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
  return (
    <View
      style={{
        position: 'absolute',
        left: cx - len / 2,
        top: cy - 0.5,
        width: len,
        height: 1,
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

  // Animations
  const blink  = useSharedValue(1);
  const floatY = useSharedValue(0);
  const glowS  = useSharedValue(1);
  const glowO  = useSharedValue(0.45);

  useEffect(() => {
    blink.value = withRepeat(withSequence(
      withTiming(0.18, { duration: 900 }),
      withTiming(1,    { duration: 900 }),
    ), -1);

    floatY.value = withRepeat(withSequence(
      withTiming(-5, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
      withTiming(0,  { duration: 1000, easing: Easing.inOut(Easing.quad) }),
    ), -1);

    glowS.value = withRepeat(withSequence(
      withTiming(2.4, { duration: 1200, easing: Easing.out(Easing.quad) }),
      withTiming(1,   { duration: 1200, easing: Easing.in(Easing.quad) }),
    ), -1);

    glowO.value = withRepeat(withSequence(
      withTiming(0,    { duration: 1200 }),
      withTiming(0.45, { duration: 1200 }),
    ), -1);
  }, []);

  const blinkStyle = useAnimatedStyle(() => ({ opacity: blink.value }));
  const floatStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowS.value }],
    opacity: glowO.value,
  }));

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>FLIGHT PATH</Text>
        {msRemaining > 0 && (
          <Text style={styles.timerText}>NEXT SECTOR IN {formatMs(msRemaining)}</Text>
        )}
      </View>

      {/* Map canvas */}
      <View style={{ width: MAP_W, height: MAP_H, overflow: 'hidden' }}>

        {/* Hex grid background — extra coverage + 12° skew */}
        <View
          style={{
            position: 'absolute',
            left: -40,
            top: -40,
            width: MAP_W + 80,
            height: MAP_H + 80,
            transform: [{ rotate: '12deg' }],
          }}
          pointerEvents="none"
        >
          <HexGrid width={MAP_W + 80} height={MAP_H + 80} />
        </View>

        {/* Path lines */}
        {nodes.slice(0, -1).map((_, i) => {
          const p1 = nodeXY(i), p2 = nodeXY(i + 1);
          const isToCurrent = i === CURRENT_IDX - 1;
          const isToNext = i === CURRENT_IDX;
          return (
            <PathLine
              key={i}
              x1={p1.x} y1={p1.y}
              x2={p2.x} y2={p2.y}
              color={isToCurrent ? curColor : Colors.textMuted}
              opacity={isToCurrent ? 0.55 : isToNext ? 0.12 : 0.22}
            />
          );
        })}

        {/* Outer glow ring (animated) behind current node */}
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
              borderWidth: 1.5,
              borderColor: curColor,
            },
            glowStyle,
          ]}
        />

        {/* Ship icon — floats above current node */}
        <Animated.Text
          style={[
            styles.shipIcon,
            { color: curColor, left: cur.x - 6, top: cur.y - 42 },
            floatStyle,
          ]}
        >
          ▲
        </Animated.Text>

        {/* All sector nodes + labels */}
        {nodes.map((node, i) => {
          const { x, y } = nodeXY(i);
          const def   = node.anomalyId ? ANOMALIES[node.anomalyId] : null;
          const color = node.isCurrent
            ? curColor
            : node.isNext
            ? Colors.textMuted
            : def?.color ?? Colors.textMuted;

          const size = node.isCurrent ? 44 : 28;
          const half = size / 2;
          const alpha = node.isPast ? '1A' : node.isCurrent ? '2E' : '12';

          return (
            <Fragment key={i}>
              {/* Circle */}
              {node.isNext ? (
                <Animated.View
                  style={[
                    {
                      position: 'absolute',
                      left: x - 14,
                      top: y - 14,
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      borderWidth: 1,
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
                    borderRadius: half,
                    borderWidth: node.isCurrent ? 2 : 1,
                    borderColor: color,
                    backgroundColor: color + alpha,
                    opacity: node.isPast ? 0.45 : 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {node.isCurrent && (
                    <View style={[styles.innerDot, { backgroundColor: color }]} />
                  )}
                </View>
              )}

              {/* Sector name — positioned below or above the node to avoid overlap */}
              <Text
                style={[
                  styles.sectorName,
                  {
                    left: x - 32,
                    // Push label above the node for nodes in lower half to avoid canvas edge
                    top: node.isNext || node.isCurrent
                      ? (node.isNext ? y + 16 : y + half + 4)
                      : node.isPast && NODE_FRACS[i][1] > 0.55
                      ? y - half - 24
                      : y + half + 4,
                    color: node.isCurrent ? Colors.textPrimary : Colors.textMuted,
                    opacity: node.isPast ? 0.45 : node.isNext ? 0.3 : 1,
                  },
                ]}
                numberOfLines={1}
              >
                {node.name}
              </Text>

              {/* Anomaly tag */}
              {node.anomalyId && def && (
                <Text
                  style={[
                    styles.anomalyTag,
                    {
                      left: x - 28,
                      top: node.isPast && NODE_FRACS[i][1] > 0.55
                        ? y - half - 11
                        : node.isCurrent
                        ? y + half + 18
                        : y + half + 17,
                      color,
                      opacity: node.isPast ? 0.5 : 1,
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    gap: Spacing.xs,
    alignItems: 'center',
    overflow: 'hidden',
  },
  header: {
    width: MAP_W,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  headerLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
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
  innerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
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
