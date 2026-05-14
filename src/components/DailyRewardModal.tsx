import { useState } from 'react';
import { View, Text, Modal, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import {
  claimDailyReward,
  previewClaimStreak,
  previewRewardForStreak,
  DailyReward,
} from '@/services/DailyRewardService';
import { useGameStore } from '@/store/useGameStore';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function rewardLine(r: DailyReward): { label: string; value: string; color: string }[] {
  const lines: { label: string; value: string; color: string }[] = [];
  if (r.credits)    lines.push({ label: 'CREDITS',  value: `+${r.credits.toLocaleString()}`,  color: Colors.credits });
  if (r.stardust)   lines.push({ label: 'STARDUST', value: `+${r.stardust} ✦`,                color: Colors.accent });
  if (r.fuel)       lines.push({ label: 'FUEL',     value: `+${r.fuel} ⚡`,                    color: Colors.attack });
  if (r.boost)      lines.push({ label: 'BOOST',    value: `+${r.boost} ▲`,                   color: Colors.raid });
  if (r.shields)    lines.push({ label: 'SHIELDS',  value: `+${r.shields} ◉`,                 color: Colors.shield });
  if (r.spinRefill) lines.push({ label: 'SPINS',    value: 'REFILL',                          color: Colors.accent });
  return lines;
}

export function DailyRewardModal({ visible, onClose }: Props) {
  const { lastDailyClaimAt, dailyClaimStreak } = useGameStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState<{ streak: number; reward: DailyReward } | null>(null);

  const previewStreak = claimed?.streak ?? previewClaimStreak(dailyClaimStreak, lastDailyClaimAt);
  const previewReward = claimed?.reward ?? previewRewardForStreak(previewStreak);
  const lines = rewardLine(previewReward);
  const cycleDay = ((previewStreak - 1) % 7) + 1;
  const isMilestone = cycleDay === 7;

  async function onClaim() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await claimDailyReward();
      setClaimed({ streak: res.streak, reward: res.reward });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={claimed ? onClose : undefined}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <LinearGradient
            colors={[Colors.gradientStart + '55', Colors.gradientEnd + '22', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <Text style={styles.eyebrow}>DAILY SIGNAL</Text>
            <Text style={styles.title}>DAY {previewStreak}</Text>
            <Text style={styles.subtitle}>
              {isMilestone ? 'WEEKLY MILESTONE' : `${7 - cycleDay} TO MILESTONE`}
            </Text>
          </LinearGradient>

          <View style={styles.rewardList}>
            {lines.map((l) => (
              <View key={l.label} style={styles.rewardRow}>
                <Text style={styles.rewardLabel}>{l.label}</Text>
                <Text style={[styles.rewardValue, { color: l.color }]}>{l.value}</Text>
              </View>
            ))}
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          {claimed ? (
            <Pressable onPress={onClose} style={[styles.btn, { backgroundColor: Colors.accent }]}>
              <Text style={styles.btnText}>CONTINUE</Text>
            </Pressable>
          ) : (
            <Pressable onPress={onClaim} disabled={busy} style={[styles.btn, { backgroundColor: Colors.accent, opacity: busy ? 0.6 : 1 }]}>
              {busy ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.btnText}>CLAIM</Text>}
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  sheet: {
    width: '100%', maxWidth: 360,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  header: { padding: Spacing.lg, alignItems: 'center' },
  eyebrow: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 3 },
  title: { fontSize: 40, fontWeight: Typography.weights.bold, color: Colors.accent, letterSpacing: 4, marginTop: Spacing.xs },
  subtitle: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 2, marginTop: 2 },
  rewardList: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md, gap: Spacing.sm },
  rewardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  rewardLabel: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 2 },
  rewardValue: { fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold, letterSpacing: 1 },
  btn: { margin: Spacing.lg, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center' },
  btnText: { fontSize: Typography.sizes.md, fontWeight: Typography.weights.bold, color: Colors.background, letterSpacing: 3 },
  error: { color: Colors.danger, fontSize: Typography.sizes.xs, textAlign: 'center', paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm },
});
