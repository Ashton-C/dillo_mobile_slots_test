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
import { Colors, Typography } from '@/constants/theme';
import { AnomalyId, ANOMALIES } from '@/services/AnomalyService';

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

function sectorLabel(seed: number): string {
  const letters = ['A', 'B', 'G', 'D', 'K', 'Z', 'S', 'T', 'N', 'X'];
  const num = ((seed >>> 4) % 99) + 1;
  return `SEC-${letters[seed % letters.length]}${num < 10 ? '0' + num : num}`;
}

function anomalyFromSeed(seed: number): AnomalyId {
  return ANOMALY_POOL[seed % ANOMALY_POOL.length];
}

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
      name: sectorLabel(seed),
      anomalyId: anomalyFromSeed(seed),
      isCurrent: false,
      isPast: true,
      isNext: false,
    });
  }

  nodes.push({
    name: sectorLabel(mixSeed(base)),
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

function formatMs(ms: number): string {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Canvas dimensions — sized to fit within the scroll-padded container
const W = Dimensions.get('window').width - 40;
const H = 108;
const NODE_Y = 44;
const SHIP_Y = 10;
const LABEL_Y1 = NODE_Y + 14;
const LABEL_Y2 = LABEL_Y1 + 13;
// 5 evenly spaced node positions
const XS = [0.1, 0.3, 0.5, 0.7, 0.9].map(f => Math.round(f * W));
const CURRENT_IDX = 3;

interface Props {
  startedAt: number | null;
  currentAnomalyId: AnomalyId | null;
  msRemaining: number;
}

export function SectorTrailMap({ startedAt, currentAnomalyId, msRemaining }: Props) {
  const nodes = buildNodes(startedAt, currentAnomalyId);
  const curDef = currentAnomalyId ? ANOMALIES[currentAnomalyId] : null;
  const curColor = curDef?.color ?? Colors.accent;

  const blink  = useSharedValue(1);
  const floatY = useSharedValue(0);
  const glowS  = useSharedValue(1);
  const glowO  = useSharedValue(0.4);

  useEffect(() => {
    blink.value = withRepeat(withSequence(
      withTiming(0.2, { duration: 850 }),
      withTiming(1,   { duration: 850 }),
    ), -1);

    floatY.value = withRepeat(withSequence(
      withTiming(-4, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      withTiming(0,  { duration: 900, easing: Easing.inOut(Easing.quad) }),
    ), -1);

    glowS.value = withRepeat(withSequence(
      withTiming(2.2, { duration: 1100, easing: Easing.out(Easing.quad) }),
      withTiming(1,   { duration: 1100, easing: Easing.in(Easing.quad) }),
    ), -1);

    glowO.value = withRepeat(withSequence(
      withTiming(0,   { duration: 1100 }),
      withTiming(0.4, { duration: 1100 }),
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
      <View style={styles.header}>
        <Text style={styles.headerLabel}>FLIGHT PATH</Text>
        {msRemaining > 0 && (
          <Text style={styles.timerText}>NEXT SECTOR IN {formatMs(msRemaining)}</Text>
        )}
      </View>

      <View style={{ width: W, height: H }}>

        {/* Path lines between nodes */}
        {XS.slice(0, -1).map((x1, i) => {
          const x2 = XS[i + 1];
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: x1,
                top: NODE_Y,
                width: x2 - x1,
                height: 1,
                backgroundColor: i === CURRENT_IDX - 1 ? curColor : Colors.textMuted,
                opacity: i === CURRENT_IDX - 1 ? 0.45 : i < CURRENT_IDX - 1 ? 0.18 : 0.12,
              }}
            />
          );
        })}

        {/* Pulsing glow ring behind current node */}
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: XS[CURRENT_IDX] - 14,
              top: NODE_Y - 14,
              width: 28,
              height: 28,
              borderRadius: 14,
              borderWidth: 1.5,
              borderColor: curColor,
            },
            glowStyle,
          ]}
        />

        {/* Ship icon floating above current node */}
        <Animated.Text
          style={[
            styles.shipIcon,
            { color: curColor, left: XS[CURRENT_IDX] - 5, top: SHIP_Y },
            floatStyle,
          ]}
        >
          ▲
        </Animated.Text>

        {/* Node circles + labels */}
        {nodes.map((node, i) => {
          const cx   = XS[i];
          const def  = node.anomalyId ? ANOMALIES[node.anomalyId] : null;
          const color = node.isCurrent ? curColor
            : node.isNext ? Colors.textMuted
            : def?.color ?? Colors.textMuted;
          const size = node.isCurrent ? 18 : 14;

          return (
            <Fragment key={i}>
              {/* Circle */}
              {node.isNext ? (
                <Animated.View style={[styles.nextCircle, { left: cx - 7, top: NODE_Y - 7 }, blinkStyle]}>
                  <Text style={styles.nextQ}>?</Text>
                </Animated.View>
              ) : (
                <View
                  style={[
                    styles.circle,
                    {
                      left: cx - size / 2,
                      top: NODE_Y - size / 2,
                      width: size,
                      height: size,
                      borderRadius: size / 2,
                      borderWidth: node.isCurrent ? 1.5 : 1,
                      borderColor: color,
                      backgroundColor: color + (node.isCurrent ? '2A' : '15'),
                      opacity: node.isPast ? 0.42 : 1,
                    },
                  ]}
                >
                  {node.isCurrent && <View style={[styles.core, { backgroundColor: color }]} />}
                </View>
              )}

              {/* Sector name */}
              <Text
                style={[
                  styles.sectorName,
                  {
                    left: cx - 26,
                    top: LABEL_Y1,
                    color: node.isCurrent ? Colors.textPrimary : Colors.textMuted,
                    opacity: node.isPast ? 0.4 : node.isNext ? 0.3 : 1,
                  },
                ]}
                numberOfLines={1}
              >
                {node.name}
              </Text>

              {/* Anomaly short label */}
              {node.anomalyId && def && (
                <Text
                  style={[
                    styles.anomalyTag,
                    {
                      left: cx - 28,
                      top: LABEL_Y2,
                      color,
                      opacity: node.isPast ? 0.45 : 1,
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 4,
    alignItems: 'center',
  },
  header: {
    width: W,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
    fontSize: 10,
    fontWeight: '700',
  },
  nextCircle: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: Colors.textMuted,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextQ: {
    fontSize: 7,
    color: Colors.textMuted,
    fontWeight: '700',
  },
  circle: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  core: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  sectorName: {
    position: 'absolute',
    width: 52,
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
