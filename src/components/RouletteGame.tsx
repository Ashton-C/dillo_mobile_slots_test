import { useEffect, useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  SharedValue,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  cancelAnimation,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { writeCombatRequest, PlayerIndexEntry } from '@/services/FirestoreService';
import { auth } from '@/lib/firebase';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

type BetType = 'EVEN' | 'SECTOR' | 'JACKPOT';
type Phase = 'BET' | 'SPINNING' | 'DONE';

const BET_CONFIGS: Record<BetType, { label: string; odds: string; segments: number; winPower: number; color: string }> = {
  EVEN:    { label: 'EVEN',    odds: '50%', segments: 6, winPower: 75,  color: Colors.primary },
  SECTOR:  { label: 'SECTOR',  odds: '33%', segments: 4, winPower: 110, color: Colors.accent },
  JACKPOT: { label: 'JACKPOT', odds: '17%', segments: 2, winPower: 145, color: Colors.credits },
};

// 12 segments: EVEN×6, SECTOR×4, JACKPOT×2
const SEGMENT_ZONES: BetType[] = [
  'EVEN', 'EVEN', 'SECTOR', 'EVEN', 'SECTOR', 'EVEN',
  'EVEN', 'JACKPOT', 'EVEN', 'SECTOR', 'EVEN', 'JACKPOT',
];

const WHEEL_SIZE   = 240;
const WHEEL_CENTER = 120;
const DOT_RADIUS   = 90;
const BALL_ORBIT   = 108;
const DOT_SIZE     = 14;
const SEG_COUNT    = 12;

function segAngle(i: number): number {
  return -Math.PI / 2 + (i / SEG_COUNT) * Math.PI * 2;
}

interface Props {
  visible: boolean;
  target: PlayerIndexEntry | null;
  combatType: 'INTRUSION' | 'EXTRACTION';
  onClose: () => void;
  onResult: (won: boolean) => void;
}

// ---------------------------------------------------------------------------
// WheelView
// ---------------------------------------------------------------------------

function WheelView({
  ballAngle,
  activeBet,
  landedIdx,
}: {
  ballAngle: SharedValue<number>;
  activeBet: BetType | null;
  landedIdx: number | null;
}) {
  const ballStyle = useAnimatedStyle(() => {
    const x = WHEEL_CENTER + Math.cos(ballAngle.value) * BALL_ORBIT - 6;
    const y = WHEEL_CENTER + Math.sin(ballAngle.value) * BALL_ORBIT - 6;
    return { transform: [{ translateX: x }, { translateY: y }] };
  });

  return (
    <View style={wheelStyles.container}>
      <View style={wheelStyles.outerRing} />
      <View style={wheelStyles.innerRing} />
      {SEGMENT_ZONES.map((zone, i) => {
        const a = segAngle(i);
        const x = WHEEL_CENTER + Math.cos(a) * DOT_RADIUS - DOT_SIZE / 2;
        const y = WHEEL_CENTER + Math.sin(a) * DOT_RADIUS - DOT_SIZE / 2;
        const isLanded = landedIdx === i;
        const color = BET_CONFIGS[zone].color;
        const isHighlighted = activeBet === zone;
        return (
          <View
            key={i}
            style={[
              wheelStyles.dot,
              {
                left: x,
                top: y,
                backgroundColor: isLanded
                  ? color
                  : isHighlighted
                  ? color + 'AA'
                  : color + '33',
                borderColor: isLanded || isHighlighted ? color : 'transparent',
                borderWidth: isLanded || isHighlighted ? 1 : 0,
                transform: [{ scale: isLanded ? 1.35 : 1 }],
              },
            ]}
          />
        );
      })}
      <View style={wheelStyles.hub} />
      <Animated.View style={[wheelStyles.ball, ballStyle]} />
    </View>
  );
}

const wheelStyles = StyleSheet.create({
  container: {
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    alignSelf: 'center',
  },
  outerRing: {
    position: 'absolute',
    width: WHEEL_SIZE,
    height: WHEEL_SIZE,
    borderRadius: WHEEL_SIZE / 2,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  innerRing: {
    position: 'absolute',
    left: WHEEL_CENTER - 70,
    top: WHEEL_CENTER - 70,
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
    borderColor: Colors.border + '55',
  },
  dot: {
    position: 'absolute',
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
  hub: {
    position: 'absolute',
    left: WHEEL_CENTER - 12,
    top: WHEEL_CENTER - 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  ball: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.textPrimary,
    shadowColor: Colors.textPrimary,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 5,
    elevation: 6,
  },
});

// ---------------------------------------------------------------------------
// BetButtons
// ---------------------------------------------------------------------------

function BetButtons({
  activeBet,
  onSelect,
  disabled,
}: {
  activeBet: BetType | null;
  onSelect: (b: BetType) => void;
  disabled: boolean;
}) {
  return (
    <View style={betStyles.row}>
      {(Object.entries(BET_CONFIGS) as [BetType, typeof BET_CONFIGS[BetType]][]).map(([key, cfg]) => {
        const isActive = activeBet === key;
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            disabled={disabled}
            style={[
              betStyles.btn,
              { borderColor: isActive ? cfg.color : Colors.border },
              isActive && { backgroundColor: cfg.color + '22' },
            ]}
          >
            <Text style={[betStyles.label, { color: cfg.color }]}>{cfg.label}</Text>
            <Text style={betStyles.oddsText}>{cfg.odds}</Text>
            <Text style={betStyles.power}>{cfg.winPower} PWR</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const betStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  btn: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  oddsText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
  },
  power: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
});

// ---------------------------------------------------------------------------
// RouletteGame
// ---------------------------------------------------------------------------

export function RouletteGame({ visible, target, combatType, onClose, onResult }: Props) {
  const [phase, setPhase] = useState<Phase>('BET');
  const [activeBet, setActiveBet] = useState<BetType | null>(null);
  const [landedIdx, setLandedIdx] = useState<number | null>(null);
  const [won, setWon] = useState(false);
  const [resultText, setResultText] = useState('');

  const ballAngle = useSharedValue(-Math.PI / 2);

  useEffect(() => {
    if (!visible) {
      cancelAnimation(ballAngle);
      return;
    }
    setPhase('BET');
    setActiveBet(null);
    setLandedIdx(null);
    setWon(false);
    setResultText('');
    ballAngle.value = -Math.PI / 2;
  }, [visible]);

  function startSpin() {
    if (!activeBet) return;
    setPhase('SPINNING');

    const cfg = BET_CONFIGS[activeBet];
    const didWin = Math.random() < cfg.segments / SEG_COUNT;

    // Pick a random segment from the winning or losing pool
    const pool = SEGMENT_ZONES
      .map((zone, i) => ({ zone, i }))
      .filter((s) => (didWin ? s.zone === activeBet : s.zone !== activeBet));
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    const targetRad = segAngle(chosen.i);

    // Monotonically increasing angle: 3 full laps + remaining arc to target
    const current = ballAngle.value;
    const twoPi = Math.PI * 2;
    const remaining = ((targetRad - current) % twoPi + twoPi) % twoPi;
    const endRad = current + 3 * twoPi + remaining;

    ballAngle.value = withTiming(endRad, {
      duration: 3200,
      easing: Easing.out(Easing.poly(3)),
    }, (finished) => {
      if (finished) runOnJS(onSpinComplete)(didWin, chosen.i, activeBet);
    });
  }

  function onSpinComplete(didWin: boolean, segIdx: number, bet: BetType) {
    const power = didWin ? BET_CONFIGS[bet].winPower : 8;
    const uid = auth.currentUser?.uid;
    if (uid && target) {
      writeCombatRequest({
        attackerUid: uid,
        defenderUid: target.uid,
        type: combatType,
        attackerPower: power,
      }).catch(console.error);
    }

    Haptics.notificationAsync(
      didWin ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});

    const label = combatType === 'INTRUSION' ? 'BREACH' : 'EXTRACTION';
    setLandedIdx(segIdx);
    setWon(didWin);
    setResultText(didWin ? `${label} SUCCESSFUL` : `${label} REPELLED`);

    setTimeout(() => {
      setPhase('DONE');
      onResult(didWin);
    }, 600);
  }

  const accentColor = combatType === 'INTRUSION' ? Colors.danger : Colors.accent;
  const typeLabel   = combatType === 'INTRUSION' ? '⚔  INTRUSION PROTOCOL' : '⛏  EXTRACTION BEAM';
  const activeBetCfg = activeBet ? BET_CONFIGS[activeBet] : null;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.panel}>

          <LinearGradient colors={[accentColor + '33', 'transparent']} style={styles.headerGrad}>
            <Text style={[styles.typeLabel, { color: accentColor }]}>{typeLabel}</Text>
            {target && (
              <Text style={styles.targetLabel}>TARGET  ·  {target.displayName.toUpperCase()}</Text>
            )}
          </LinearGradient>

          {phase === 'BET' && (
            <Text style={styles.instruction}>SELECT YOUR BET TYPE</Text>
          )}
          {phase === 'SPINNING' && (
            <Text style={styles.instruction}>BALL IN PLAY...</Text>
          )}
          {phase === 'DONE' && (
            <Text style={[styles.instruction, { color: won ? Colors.success : Colors.danger }]}>
              {resultText}
            </Text>
          )}

          <View style={styles.wheelWrap}>
            <WheelView ballAngle={ballAngle} activeBet={activeBet} landedIdx={landedIdx} />
          </View>

          {phase !== 'SPINNING' && (
            <BetButtons
              activeBet={activeBet}
              onSelect={phase === 'BET' ? setActiveBet : () => {}}
              disabled={phase === 'DONE'}
            />
          )}

          {phase === 'DONE' && (
            <View style={styles.powerRow}>
              <View style={styles.powerChip}>
                <Text style={styles.powerChipLabel}>YOUR POWER</Text>
                <Text style={[styles.powerChipVal, { color: won ? Colors.success : Colors.danger }]}>
                  {activeBetCfg ? (won ? activeBetCfg.winPower : 8) : 8}
                </Text>
              </View>
              <Text style={styles.dot}>·</Text>
              <View style={styles.powerChip}>
                <Text style={styles.powerChipLabel}>DEFENDER</Text>
                <Text style={styles.powerChipVal}>SERVER</Text>
              </View>
            </View>
          )}

          {phase === 'BET' && (
            <Pressable
              onPress={startSpin}
              disabled={!activeBet}
              style={[
                styles.actionBtn,
                { borderColor: activeBet ? accentColor : Colors.border },
                !activeBet && styles.actionDisabled,
              ]}
            >
              <Text style={[styles.actionBtnText, { color: activeBet ? accentColor : Colors.textMuted }]}>
                LAUNCH  ▶
              </Text>
            </Pressable>
          )}

          {phase === 'DONE' && (
            <Pressable onPress={onClose} style={[styles.actionBtn, { borderColor: accentColor }]}>
              <Text style={[styles.actionBtnText, { color: accentColor }]}>DISMISS</Text>
            </Pressable>
          )}

        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    width: '88%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    paddingBottom: Spacing.md,
  },
  headerGrad: {
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  typeLabel: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: 3,
  },
  targetLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginTop: 4,
  },
  instruction: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textSecondary,
    letterSpacing: 2,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  wheelWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  powerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  powerChip: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  powerChipLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  powerChipVal: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.textSecondary,
  },
  dot: {
    color: Colors.textMuted,
    fontSize: Typography.sizes.md,
  },
  actionBtn: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  actionDisabled: {
    opacity: 0.4,
  },
  actionBtnText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 3,
  },
});
