import { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, TextInput, Modal, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/store/useAuthStore';
import { useGameStore } from '@/store/useGameStore';
import { useEventStore } from '@/store/useEventStore';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
import {
  NAMEPLATE_STYLES,
  EMBLEM_GLYPHS,
  TITLE_LABELS,
  CosmeticCategory,
  CosmeticItem,
} from '@/services/CosmeticsService';
import { GameEvent } from '@/services/FirestoreService';
import { PilotAvatar, AvatarAccessory } from '@/components/PilotAvatar';
import { CosmeticCategoryGrid } from '@/components/CosmeticCategoryGrid';
import { CosmeticPurchaseModal } from '@/components/CosmeticPurchaseModal';
import { LegendCard, LegendSection, LegendRow, LegendNote } from '@/components/LegendCard';
import { IconButton } from '@/components/IconButton';
import { TopBar } from '@/components/TopBar';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const OUTPOST_COLORS = [
  { label: 'PLASMA',  value: '#9B59FF' }, // default — purple
  { label: 'EMBER',   value: '#FF6B35' },
  { label: 'NEON',    value: '#FF1493' },
  { label: 'ACID',    value: '#39FF14' },
  { label: 'ICE',     value: '#00D4FF' },
  { label: 'GOLD',    value: '#FFD700' },
  { label: 'CRIMSON', value: '#CC2244' },
  { label: 'VOID',    value: '#5C5C8A' },
];

// Pilot-related cosmetic categories shown in the Customize modal
const CUSTOMIZE_CATEGORIES: { category: CosmeticCategory; label: string }[] = [
  { category: 'HELMET',    label: 'HELMETS' },
  { category: 'FRAME',     label: 'AVATAR FRAMES' },
  { category: 'NAMEPLATE', label: 'NAMEPLATES' },
  { category: 'EMBLEM',    label: 'EMBLEMS' },
  { category: 'TITLE',     label: 'TITLES' },
];

function xpToNextLevel(level: number) { return 100 * level; }

export default function PilotScreen() {
  const { displayName, avatarColor, avatarAccessory, outpostColor, setDisplayName, setOutpostColor } = useAuthStore();
  const activeNameplate = useCosmeticsStore((s) => s.active.NAMEPLATE);
  const activeEmblem    = useCosmeticsStore((s) => s.active.EMBLEM);
  const activeTitle     = useCosmeticsStore((s) => s.active.TITLE);
  const nameplateStyle = NAMEPLATE_STYLES[activeNameplate] ?? NAMEPLATE_STYLES.nameplate_none;
  const hasNameplate   = activeNameplate !== 'nameplate_none';
  const emblemGlyph    = EMBLEM_GLYPHS[activeEmblem] ?? '';
  const titleLabel     = TITLE_LABELS[activeTitle] ?? '';
  const [pendingPurchase, setPendingPurchase] = useState<CosmeticItem | null>(null);
  const [customizeToast, setCustomizeToast] = useState<string | null>(null);
  const { credits, attacks, raids, shields, intrusions, extractions, level, xp,
          totalSpins, totalCreditsEarned, totalJackpots,
          totalBreachesAttempted, totalExtractionsAttempted, totalRaidsSuffered } = useGameStore();
  const events = useEventStore((s) => s.events);

  const [editVisible, setEditVisible] = useState(false);
  const [legendVisible, setLegendVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [customizeVisible, setCustomizeVisible] = useState(false);

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
      <TopBar
        right={<IconButton glyph="?" onPress={() => setLegendVisible(true)} />}
      />
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
              <PilotAvatar color={avatarColor} size={80} accessory={avatarAccessory as AvatarAccessory} />
            </View>
          </View>
          <Text style={[styles.pilotTitle, titleLabel && { color: nameplateStyle.accentColor }]}>{titleLabel || 'PILOT'}</Text>
          {hasNameplate ? (
            <LinearGradient
              colors={nameplateStyle.gradient as unknown as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.nameplateBanner, { borderColor: nameplateStyle.borderColor }]}
            >
              <View style={[styles.nameplateAccent, { backgroundColor: nameplateStyle.accentColor }]} />
              {emblemGlyph ? <Text style={[styles.nameplateEmblem, { color: nameplateStyle.accentColor }]}>{emblemGlyph}</Text> : null}
              <Text style={[styles.nameplateName, { color: nameplateStyle.textColor }]} numberOfLines={1}>
                {displayName ?? '—'}
              </Text>
              <View style={[styles.nameplateAccent, { backgroundColor: nameplateStyle.accentColor }]} />
            </LinearGradient>
          ) : (
            <Text style={styles.pilotName}>
              {emblemGlyph ? `${emblemGlyph}  ` : ''}{displayName ?? '—'}
            </Text>
          )}
          <View style={styles.avatarActions}>
            <Pressable onPress={() => { setEditName(displayName ?? ''); setEditVisible(true); }} style={styles.editButton}>
              <Text style={styles.editButtonText}>EDIT NAME</Text>
            </Pressable>
            <Pressable onPress={() => setCustomizeVisible(true)} style={styles.editButton}>
              <Text style={styles.editButtonText}>CUSTOMIZE</Text>
            </Pressable>
          </View>
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

        {/* Lifetime stats */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>LIFETIME</Text>
          <View style={styles.statsGrid}>
            <StatCard label="TOTAL SPINS"  value={totalSpins.toLocaleString()}               color={Colors.primary} />
            <StatCard label="JACKPOTS"      value={totalJackpots.toLocaleString()}             color={Colors.credits} />
            <StatCard label="CR EARNED"     value={totalCreditsEarned.toLocaleString()}        color={Colors.credits} />
            <StatCard label="BREACHES"      value={totalBreachesAttempted.toLocaleString()}    color={Colors.danger} />
            <StatCard label="EXTRACTIONS"   value={totalExtractionsAttempted.toLocaleString()} color={Colors.accent} />
            <StatCard label="RAIDS TAKEN"   value={totalRaidsSuffered.toLocaleString()}        color={Colors.shield} />
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

      {/* Customize modal */}
      <Modal visible={customizeVisible} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setCustomizeVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, styles.customizeCard]}>
            <Text style={styles.modalTitle}>CUSTOMIZE PILOT</Text>

            <ScrollView contentContainerStyle={styles.customizeScroll} showsVerticalScrollIndicator={false}>
              {/* Live preview */}
              <View style={styles.previewRow}>
                <PilotAvatar color={avatarColor} size={72} accessory={avatarAccessory as AvatarAccessory} />
              </View>

              {/* Outpost color picker */}
              <Text style={styles.pickerLabel}>OUTPOST COLOR</Text>
              <View style={styles.colorGrid}>
                {OUTPOST_COLORS.map((c) => (
                  <Pressable
                    key={c.value}
                    onPress={() => { Haptics.selectionAsync(); setOutpostColor(c.value); }}
                    style={[styles.colorSwatch, { backgroundColor: c.value }, outpostColor === c.value && styles.swatchActive]}
                  />
                ))}
              </View>

              {/* Cosmetic categories — owned items full color, locked dim, click locked → purchase */}
              {CUSTOMIZE_CATEGORIES.map(({ category, label }) => (
                <CosmeticCategoryGrid
                  key={category}
                  label={label}
                  category={category}
                  onLockedPress={setPendingPurchase}
                  onEquipped={(item) => { setCustomizeToast(`Equipped: ${item.name}`); setTimeout(() => setCustomizeToast(null), 1800); }}
                />
              ))}
            </ScrollView>

            {customizeToast && (
              <Text style={styles.customizeToast}>{customizeToast}</Text>
            )}

            <Pressable onPress={() => setCustomizeVisible(false)} style={styles.modalConfirm}>
              <Text style={styles.modalConfirmText}>BACK</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <CosmeticPurchaseModal
        item={pendingPurchase}
        onDismiss={() => setPendingPurchase(null)}
        onResult={(msg) => { setCustomizeToast(msg); setTimeout(() => setCustomizeToast(null), 2200); }}
      />

      <LegendCard visible={legendVisible} onDismiss={() => setLegendVisible(false)} title="PILOT LEGEND" accentColor={Colors.info}>
        <LegendSection label="XP & LEVELING" />
        <LegendRow left="+5 XP" right="every spin" />
        <LegendRow left="+20 XP" right="jackpot bonus" color={Colors.credits} />
        <LegendRow left="Level up" right="XP bar fills at 100 × level" />
        <LegendRow left="Level gates" right="Outpost upgrade tiers" />
        <LegendSection label="COMBAT POWER" />
        <LegendRow left="Determines win odds vs. defender" />
        <LegendRow left="Derived from reel locks + Outpost LVL" />
        <LegendSection label="COMBAT LOG" />
        <LegendRow left="Last 20 incoming + outgoing events" />
        <LegendRow left="ATTACK_INCOMING / RAID_RESOLVED, etc." />
        <LegendNote text="All combat is resolved server-side. Credits transfer only after the Cloud Function confirms the result." />
      </LegendCard>
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
  nameplateBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    minWidth: 180,
    gap: 8,
  },
  nameplateAccent: {
    width: 12,
    height: 2,
    opacity: 0.8,
  },
  nameplateEmblem: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
  },
  nameplateName: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
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
  avatarActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  previewRow: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  pickerLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
    alignSelf: 'flex-start',
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  swatchActive: {
    borderColor: Colors.textPrimary,
  },
  accessoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  accessoryChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  accessoryChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  accessoryText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  customizeCard: {
    maxHeight: '85%',
    width: '92%',
  },
  customizeScroll: {
    gap: Spacing.sm,
  },
  customizeToast: {
    fontSize: Typography.sizes.xs,
    color: Colors.success,
    letterSpacing: 2,
    textAlign: 'center',
    fontWeight: Typography.weights.bold,
    paddingVertical: 6,
  },
});
