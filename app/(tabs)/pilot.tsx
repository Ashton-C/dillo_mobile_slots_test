import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/useAuthStore';
import { useGameStore } from '@/store/useGameStore';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

function xpToNextLevel(level: number) { return 100 * level; }

export default function PilotScreen() {
  const { displayName, avatarColor, setDisplayName } = useAuthStore();
  const { credits, attacks, raids, shields, level, xp } = useGameStore();

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  const initial = (displayName ?? '?')[0].toUpperCase();
  const xpNeeded = xpToNextLevel(level);
  const xpPct = Math.min(1, xp / xpNeeded);

  async function handleSaveName() {
    const trimmed = editName.trim();
    if (trimmed.length < 3 || saving) return;
    setSaving(true);
    await setDisplayName(trimmed);
    setSaving(false);
    setEditVisible(false);
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={[styles.avatarRingOuter, { borderColor: Colors.accent }]}>
            <View style={[styles.avatarRingInner, { borderColor: Colors.primary }]}>
              <View style={[styles.avatarCircle, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            </View>
          </View>
          <Text style={styles.pilotTitle}>ARMADILLO PILOT</Text>
          <Text style={styles.pilotName}>{displayName ?? '—'}</Text>
          <Pressable onPress={() => { setEditName(displayName ?? ''); setEditVisible(true); }} style={styles.editButton}>
            <Text style={styles.editButtonText}>EDIT NAME</Text>
          </Pressable>
        </View>

        {/* Level & XP */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>PROGRESSION</Text>
          <View style={styles.levelRow}>
            <Text style={styles.levelLabel}>LEVEL</Text>
            <Text style={styles.levelValue}>{level}</Text>
          </View>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${xpPct * 100}%` }]} />
          </View>
          <Text style={styles.xpLabel}>{xp.toLocaleString()} / {xpNeeded.toLocaleString()} XP</Text>
        </View>

        {/* Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>RESOURCES</Text>
          <View style={styles.statsGrid}>
            <StatCard label="CREDITS" value={credits.toLocaleString()} color={Colors.credits} />
            <StatCard label="ATTACKS" value={String(attacks)} color={Colors.attack} />
            <StatCard label="RAIDS" value={String(raids)} color={Colors.raid} />
            <StatCard label="SHIELDS" value={String(shields)} color={Colors.shield} />
          </View>
        </View>

      </ScrollView>

      {/* Edit name modal */}
      <Modal visible={editVisible} transparent animationType="fade" statusBarTranslucent>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>RENAME PILOT</Text>
            <TextInput
              style={styles.modalInput}
              value={editName}
              onChangeText={(t) => setEditName(t.replace(/\s/g, ''))}
              maxLength={20}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              placeholderTextColor={Colors.textMuted}
              placeholder="New pilot name"
              color={Colors.textPrimary}
              onSubmitEditing={handleSaveName}
              returnKeyType="done"
            />
            <View style={styles.modalButtons}>
              <Pressable onPress={() => setEditVisible(false)} style={styles.modalCancel}>
                <Text style={styles.modalCancelText}>CANCEL</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveName}
                disabled={editName.trim().length < 3 || saving}
                style={[styles.modalConfirm, editName.trim().length < 3 && styles.modalConfirmDisabled]}
              >
                <Text style={styles.modalConfirmText}>{saving ? '…' : 'SAVE'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg, gap: Spacing.xl, alignItems: 'center' },

  avatarSection: { alignItems: 'center', gap: Spacing.sm, paddingTop: Spacing.md },
  avatarRingOuter: {
    width: 112,
    height: 112,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarRingInner: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    fontSize: Typography.sizes.hero,
    fontWeight: Typography.weights.bold,
    color: Colors.background,
    lineHeight: Typography.sizes.hero + 4,
  },
  pilotTitle: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 4,
    marginTop: Spacing.sm,
  },
  pilotName: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 3,
  },
  editButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  editButtonText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },

  section: { width: '100%', gap: Spacing.sm },
  sectionHeader: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
  },
  levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  levelLabel: { fontSize: Typography.sizes.sm, color: Colors.textSecondary, letterSpacing: 2 },
  levelValue: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
  },
  xpTrack: {
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  xpFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
  xpLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    alignSelf: 'flex-end',
  },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
  },
  statLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  modalTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 3,
    textAlign: 'center',
  },
  modalInput: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.sizes.md,
    letterSpacing: 1,
    textAlign: 'center',
  },
  modalButtons: { flexDirection: 'row', gap: Spacing.sm },
  modalCancel: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  modalConfirm: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  modalConfirmDisabled: { backgroundColor: Colors.surfaceElevated },
  modalConfirmText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
});
