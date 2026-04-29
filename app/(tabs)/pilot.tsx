import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '@/store/useAuthStore';
import { useGameStore } from '@/store/useGameStore';
import { useEventStore } from '@/store/useEventStore';
import { GameEvent } from '@/services/FirestoreService';
import { ArmadilloAvatar } from '@/components/ArmadilloAvatar';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

function xpToNextLevel(level: number) { return 100 * level; }

export default function PilotScreen() {
  const { displayName, avatarColor, setDisplayName } = useAuthStore();
  const { credits, attacks, raids, shields, intrusions, extractions, level, xp } = useGameStore();
  const events = useEventStore((s) => s.events);

  const [editVisible, setEditVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

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

        {/* Avatar section with gradient backdrop */}
        <LinearGradient
          colors={[Colors.gradientStart + '44', Colors.gradientEnd + '22', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.avatarSection}
        >
          <View style={[styles.avatarRingOuter, { borderColor: Colors.accent }]}>
            <View style={[styles.avatarRingInner, { borderColor: Colors.primary }]}>
              <ArmadilloAvatar color={avatarColor} size={80} />
            </View>
          </View>
          <Text style={styles.pilotTitle}>ARMADILLO PILOT</Text>
          <Text style={styles.pilotName}>{displayName ?? '—'}</Text>
          <Pressable onPress={() => { setEditName(displayName ?? ''); setEditVisible(true); }} style={styles.editButton}>
            <Text style={styles.editButtonText}>EDIT NAME</Text>
          </Pressable>
        </LinearGradient>

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
            <StatCard label="CREDITS"    value={credits.toLocaleString()} color={Colors.credits} />
            <StatCard label="FUEL"       value={String(attacks)}          color={Colors.attack} />
            <StatCard label="BOOST"      value={String(raids)}            color={Colors.raid} />
            <StatCard label="SHIELDS"    value={String(shields)}          color={Colors.shield} />
            <StatCard label="BREACH"     value={String(intrusions)}       color={Colors.danger} />
            <StatCard label="EXTRACTION" value={String(extractions)}      color={Colors.accent} />
          </View>
        </View>

        {/* Combat log */}
        <View style={[styles.section, { paddingBottom: Spacing.xl }]}>
          <Text style={styles.sectionHeader}>COMBAT LOG</Text>
          {events.length === 0 ? (
            <Text style={styles.logEmpty}>No combat activity yet</Text>
          ) : (
            events.slice(0, 20).map((e) => <CombatLogRow key={e.id} event={e} />)
          )}
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
              style={[styles.modalInput, { color: Colors.textPrimary }]}
              value={editName}
              onChangeText={(t) => setEditName(t.replace(/\s/g, ''))}
              maxLength={20}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              placeholderTextColor={Colors.textMuted}
              placeholder="New pilot name"
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

function logMeta(event: GameEvent): { icon: string; summary: string; color: string } {
  switch (event.type) {
    case 'ATTACK_INCOMING':
      return { icon: '⚠', summary: `Breach attempt by ${event.fromDisplayName}`, color: Colors.danger };
    case 'RAID_INCOMING':
      return { icon: '⚠', summary: `Extraction beam from ${event.fromDisplayName}`, color: Colors.accent };
    case 'ATTACK_RESOLVED':
      return event.attackerWon
        ? { icon: '✗', summary: `Breached by ${event.fromDisplayName} — lost ${event.creditsLost ?? 0} CR`, color: Colors.danger }
        : { icon: '◉', summary: `Breach by ${event.fromDisplayName} was repelled`, color: Colors.shield };
    case 'RAID_RESOLVED':
      return event.attackerWon
        ? { icon: '✗', summary: `${event.fromDisplayName} siphoned ${event.creditsLost ?? 0} CR`, color: Colors.accent }
        : { icon: '◉', summary: `Extraction blocked — VAULT held`, color: Colors.shield };
    case 'COMBAT_RESULT':
      return event.attackerWon
        ? { icon: '⚔', summary: `Raid on ${event.fromDisplayName} succeeded +${event.creditsGained ?? 0} CR`, color: Colors.success }
        : { icon: '✗', summary: `Raid on ${event.fromDisplayName} failed`, color: Colors.textMuted };
    default:
      return { icon: '·', summary: 'Transmission received', color: Colors.textMuted };
  }
}

function CombatLogRow({ event }: { event: GameEvent }) {
  const { icon, summary, color } = logMeta(event);
  const age = Date.now() - event.timestamp;
  const ageLabel = age < 60_000 ? 'just now'
    : age < 3_600_000 ? `${Math.floor(age / 60_000)}m ago`
    : age < 86_400_000 ? `${Math.floor(age / 3_600_000)}h ago`
    : `${Math.floor(age / 86_400_000)}d ago`;

  return (
    <View style={styles.logRow}>
      <View style={[styles.logDot, { backgroundColor: color }]} />
      <View style={styles.logContent}>
        <Text style={[styles.logIcon, { color }]}>{icon}  <Text style={styles.logSummary}>{summary}</Text></Text>
        <Text style={styles.logAge}>{ageLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { gap: Spacing.xl, alignItems: 'center' },

  avatarSection: {
    width: '100%',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
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

  section: { width: '100%', gap: Spacing.sm, paddingHorizontal: Spacing.lg },
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

  logEmpty: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
    fontStyle: 'italic',
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  logDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
    flexShrink: 0,
  },
  logContent: { flex: 1, gap: 2 },
  logIcon: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.5,
  },
  logSummary: {
    fontWeight: Typography.weights.regular,
    color: Colors.textSecondary,
  },
  logAge: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
});
