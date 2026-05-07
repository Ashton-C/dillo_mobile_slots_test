import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { hapticBuildStart } from '@/constants/haptics';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { outpostUpgradeCost, outpostUpgradeDuration } from '@/models/Habitat';
import { SkipBuildModal } from '@/components/SkipBuildModal';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

function formatTimer(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function OutpostDetailModal({ visible, onClose }: Props) {
  const { credits, subtractCredits } = useGameStore();
  const { outpostLevel, activeBuildJob, msUntilComplete, upgradeOutpost } = useHabitatStore();
  const [skipVisible, setSkipVisible] = useState(false);

  const cost         = outpostUpgradeCost(outpostLevel);
  const duration     = outpostUpgradeDuration(outpostLevel + 1);
  const maxed        = outpostLevel >= 10;
  const builderBusy  = activeBuildJob !== null;
  const isUpgrading  = activeBuildJob?.isOutpost === true;
  const canAfford    = credits >= cost;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>OUTPOST</Text>
            <Text style={styles.levelBadge}>LVL {outpostLevel}</Text>
          </View>

          <Text style={styles.desc}>
            The Outpost level caps all buildings. Upgrading unlocks higher tiers for every structure.
          </Text>

          {!maxed && (
            <View style={styles.infoRow}>
              <View style={styles.infoChip}>
                <Text style={styles.infoChipLabel}>NEXT LEVEL</Text>
                <Text style={styles.infoChipValue}>{outpostLevel + 1}</Text>
              </View>
              <View style={styles.infoChip}>
                <Text style={styles.infoChipLabel}>COST</Text>
                <Text style={[styles.infoChipValue, { color: Colors.credits }]}>{cost.toLocaleString()} CR</Text>
              </View>
              <View style={styles.infoChip}>
                <Text style={styles.infoChipLabel}>TIME</Text>
                <Text style={styles.infoChipValue}>{formatTimer(duration)}</Text>
              </View>
            </View>
          )}

          {maxed ? (
            <View style={[styles.upgradeBtn, styles.upgradeBtnDisabled]}>
              <Text style={styles.upgradeBtnTextMuted}>OUTPOST MAXED</Text>
            </View>
          ) : isUpgrading ? (
            <Pressable
              onPress={() => setSkipVisible(true)}
              style={[styles.upgradeBtn, { borderColor: Colors.accent, borderWidth: 1, backgroundColor: Colors.surfaceElevated }]}
            >
              <Text style={[styles.upgradeBtnText, { color: Colors.accent }]}>
                UPGRADING  {formatTimer(msUntilComplete)}
              </Text>
              <Text style={{ fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 1, marginTop: 2 }}>
                ⚡  TAP TO FINISH NOW
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => { hapticBuildStart(); upgradeOutpost(subtractCredits); onClose(); }}
              disabled={builderBusy || !canAfford}
              style={[styles.upgradeBtn, (builderBusy || !canAfford) && styles.upgradeBtnDisabled]}
            >
              <Text style={[(builderBusy || !canAfford) ? styles.upgradeBtnTextMuted : styles.upgradeBtnText]}>
                {builderBusy ? 'BUILDER BUSY' : !canAfford ? `NEED ${cost.toLocaleString()} CR` : `UPGRADE  ${cost.toLocaleString()} CR`}
              </Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
      <SkipBuildModal visible={skipVisible} onClose={() => setSkipVisible(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderTopWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.xs },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold, color: Colors.accent, letterSpacing: 3 },
  levelBadge: { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: Colors.accent },
  desc: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 0.5, lineHeight: 18 },
  infoRow: { flexDirection: 'row', gap: Spacing.sm },
  infoChip: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  infoChipLabel: { fontSize: 9, color: Colors.textMuted, letterSpacing: 2 },
  infoChipValue: { fontSize: Typography.sizes.md, fontWeight: Typography.weights.bold, color: Colors.textPrimary },
  upgradeBtn: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.sm,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  upgradeBtnDisabled: { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: Colors.border },
  upgradeBtnText: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, color: Colors.background, letterSpacing: 2 },
  upgradeBtnTextMuted: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, color: Colors.textMuted, letterSpacing: 2 },
});
