import { useEffect, useRef, useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedStyle,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { writeCombatRequest, PlayerIndexEntry } from '@/services/FirestoreService';
import { auth } from '@/lib/firebase';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

// --- Mini-reel symbol pools --------------------------------------------------
const COMBAT_SYMBOLS = ['◈', '⚡', '▲', '⚔', '◉', '⛏', '◈◈', '●'];

const REEL_SPEEDS_MS = [130, 160, 190]; // different tick rates per reel

type CombatType = 'INTRUSION' | 'EXTRACTION';

interface MiniReel {
  symbols: string[];
  locked: boolean;
  index: number;
}

function buildReel(): MiniReel {
  const shuffled = [...COMBAT_SYMBOLS].sort(() => Math.random() - 0.5);
  return { symbols: shuffled, locked: false, index: 0 };
}

interface PowerBreakdown {
  base: number;
  matchBonus: number;
  outpostBonus: number;
  variance: number;
  total: number;
}

function evaluateAttackerPower(reels: MiniReel[], outpostLevel: number): PowerBreakdown {
  const values = reels.map((r) => r.symbols[r.index % r.symbols.length]);
  const unique = new Set(values).size;
  const matchBonus = unique === 1 ? 40 : unique === 2 ? 20 : 0;
  const base = 50;
  const outpostBonus = outpostLevel * 15;
  const variance = Math.floor(Math.random() * 21) - 10; // ±10
  return { base, matchBonus, outpostBonus, variance, total: base + matchBonus + outpostBonus + variance };
}

function evaluateDefenderPower(targetOutpostLevel: number): PowerBreakdown {
  const base = 30;
  const matchBonus = 0;
  const outpostBonus = targetOutpostLevel * 15;
  const variance = Math.floor(Math.random() * 31) - 15; // ±15
  return { base, matchBonus, outpostBonus, variance, total: base + matchBonus + outpostBonus + variance };
}

interface Props {
  visible: boolean;
  target: PlayerIndexEntry | null;
  combatType: CombatType;
  onClose: () => void;
  onResult: (won: boolean) => void;
}

interface PowerColumnProps {
  title: string;
  color: string;
  pb: PowerBreakdown;
  showMatch?: boolean;
}

function PowerColumn({ title, color, pb, showMatch }: PowerColumnProps) {
  return (
    <View style={styles.powerCol}>
      <Text style={styles.powerTitle}>{title}</Text>
      <Text style={[styles.powerTotal, { color }]}>{pb.total}</Text>
      <Text style={styles.powerLine}>BASE  {pb.base}</Text>
      {showMatch && pb.matchBonus > 0 && (
        <Text style={[styles.powerLine, { color: Colors.warning }]}>MATCH  +{pb.matchBonus}</Text>
      )}
      {pb.outpostBonus > 0 && (
        <Text style={styles.powerLine}>OUTPOST  +{pb.outpostBonus}</Text>
      )}
      <Text style={styles.powerLine}>RNG  {pb.variance >= 0 ? '+' : ''}{pb.variance}</Text>
    </View>
  );
}

export function CombatMiniGame({ visible, target, combatType, onClose, onResult }: Props) {
  const [reels, setReels] = useState<MiniReel[]>([buildReel(), buildReel(), buildReel()]);
  const [phase, setPhase] = useState<'SPINNING' | 'RESOLVING' | 'DONE'>('SPINNING');
  const [resultText, setResultText] = useState('');
  const [resultColor, setResultColor] = useState<string>(Colors.textPrimary);
  const [attackerPower, setAttackerPower] = useState<PowerBreakdown | null>(null);
  const [defenderPower, setDefenderPower] = useState<PowerBreakdown | null>(null);
  const [didWin, setDidWin] = useState(false);
  const timersRef = useRef<ReturnType<typeof setInterval>[]>([]);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outpostLevel = useHabitatStore((s) => s.outpostLevel);
  const flashOpacity = useSharedValue(0);

  // Reset state each time modal opens
  useEffect(() => {
    if (!visible) return;
    const fresh = [buildReel(), buildReel(), buildReel()];
    setReels(fresh);
    setPhase('SPINNING');
    setResultText('');
    setAttackerPower(null);
    setDefenderPower(null);

    // Start cycling each reel at its own speed
    const newTimers = fresh.map((_, i) => {
      return setInterval(() => {
        setReels((prev) => {
          if (prev[i].locked) return prev;
          const next = [...prev];
          next[i] = { ...next[i], index: (next[i].index + 1) % next[i].symbols.length };
          return next;
        });
      }, REEL_SPEEDS_MS[i]);
    });
    timersRef.current = newTimers;

    // Auto-stop all reels after 3 seconds
    autoStopRef.current = setTimeout(() => {
      lockAll();
    }, 3000);

    return () => cleanup();
  }, [visible]);

  function cleanup() {
    timersRef.current.forEach(clearInterval);
    timersRef.current = [];
    if (autoStopRef.current) clearTimeout(autoStopRef.current);
  }

  function lockReel(i: number) {
    setReels((prev) => {
      if (prev[i].locked || phase !== 'SPINNING') return prev;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const next = [...prev];
      next[i] = { ...next[i], locked: true };

      // Stop that reel's timer
      if (timersRef.current[i]) {
        clearInterval(timersRef.current[i]);
      }

      // If all locked, resolve
      const allLocked = next.every((r) => r.locked);
      if (allLocked) {
        resolveWithReels(next);
      }
      return next;
    });
  }

  function lockAll() {
    cleanup();
    setReels((prev) => {
      const next = prev.map((r) => ({ ...r, locked: true }));
      resolveWithReels(next);
      return next;
    });
  }

  function resolveWithReels(lockedReels: MiniReel[]) {
    setPhase('RESOLVING');
    const aPower = evaluateAttackerPower(lockedReels, outpostLevel);
    const dPower = evaluateDefenderPower(target?.outpostLevel ?? 1);
    const won = aPower.total > dPower.total;
    setAttackerPower(aPower);
    setDefenderPower(dPower);
    setDidWin(won);

    // Fire the combat request — Cloud Function resolves actual resource changes
    const uid = auth.currentUser?.uid;
    if (uid && target) {
      writeCombatRequest({
        attackerUid: uid,
        defenderUid: target.uid,
        type: combatType,
        attackerPower: aPower.total,
      }).catch(console.error);
    }

    flashOpacity.value = withRepeat(withTiming(1, { duration: 80 }), 4, true);

    const label = combatType === 'INTRUSION' ? 'BREACH' : 'EXTRACTION';
    setResultText(won ? `${label} SUCCESSFUL` : `${label} REPELLED`);
    setResultColor(won ? Colors.success : Colors.danger);

    Haptics.notificationAsync(
      won ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error,
    ).catch(() => {});

    setTimeout(() => {
      setPhase('DONE');
      onResult(won);
    }, 2400);
  }

  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  const accentColor = combatType === 'INTRUSION' ? Colors.danger : Colors.accent;
  const typeLabel  = combatType === 'INTRUSION' ? '⚔  INTRUSION PROTOCOL' : '⛏  EXTRACTION BEAM';

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.panel}>

          <LinearGradient
            colors={[accentColor + '33', 'transparent']}
            style={styles.headerGrad}
          >
            <Text style={[styles.typeLabel, { color: accentColor }]}>{typeLabel}</Text>
            {target && (
              <Text style={styles.targetLabel}>TARGET  ·  {target.displayName.toUpperCase()}</Text>
            )}
          </LinearGradient>

          <Text style={styles.instruction}>
            {phase === 'SPINNING' ? 'TAP EACH REEL TO LOCK' : phase === 'RESOLVING' ? 'CALCULATING POWER...' : ''}
          </Text>

          {/* Mini-reels */}
          <View style={styles.reelRow}>
            {reels.map((reel, i) => {
              const sym = reel.symbols[reel.index % reel.symbols.length];
              return (
                <Pressable
                  key={i}
                  onPress={() => lockReel(i)}
                  disabled={reel.locked || phase !== 'SPINNING'}
                  style={[
                    styles.reelCell,
                    { borderColor: reel.locked ? accentColor : Colors.border },
                  ]}
                >
                  <Text style={[styles.reelSymbol, { color: reel.locked ? accentColor : Colors.textSecondary }]}>
                    {sym}
                  </Text>
                  {reel.locked && (
                    <View style={[styles.lockBadge, { borderColor: accentColor }]}>
                      <Text style={[styles.lockText, { color: accentColor }]}>LOCK</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Result flash overlay */}
          {phase === 'RESOLVING' && (
            <Animated.View style={[styles.flashOverlay, flashStyle]} />
          )}

          {/* Result text */}
          {resultText !== '' && (
            <Text style={[styles.resultText, { color: resultColor }]}>{resultText}</Text>
          )}

          {/* Power breakdown — visible during RESOLVING + DONE */}
          {attackerPower && defenderPower && (
            <View style={styles.powerBlock}>
              <PowerColumn
                title="YOUR POWER"
                color={didWin ? Colors.success : Colors.textSecondary}
                pb={attackerPower}
                showMatch
              />
              <Text style={styles.vs}>VS</Text>
              <PowerColumn
                title="DEFENDER"
                color={didWin ? Colors.textSecondary : Colors.danger}
                pb={defenderPower}
              />
            </View>
          )}

          {phase === 'DONE' && (
            <Pressable onPress={onClose} style={[styles.closeButton, { borderColor: accentColor }]}>
              <Text style={[styles.closeButtonText, { color: accentColor }]}>DISMISS</Text>
            </Pressable>
          )}

          {phase === 'SPINNING' && (
            <Pressable onPress={lockAll} style={styles.autoLock}>
              <Text style={styles.autoLockText}>STOP ALL</Text>
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
    color: Colors.textSecondary,
    letterSpacing: 2,
    textAlign: 'center',
    paddingVertical: Spacing.sm,
  },
  reelRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  reelCell: {
    flex: 1,
    height: 90,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  reelSymbol: {
    fontSize: 32,
    lineHeight: 40,
  },
  lockBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  lockText: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  flashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.06)',
    pointerEvents: 'none',
  },
  resultText: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  powerBlock: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  powerCol: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  powerTitle: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  powerTotal: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
    marginBottom: 2,
  },
  powerLine: {
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  vs: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
    fontWeight: Typography.weights.bold,
    paddingTop: Spacing.md,
  },
  closeButton: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 3,
  },
  autoLock: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  autoLockText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
});
