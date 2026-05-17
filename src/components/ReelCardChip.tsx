import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { useGameStore } from '@/store/useGameStore';
import { getCardDefinition, SHRED_VALUE_CR } from '@/models/Card';
import type { CardDefinition, CardRarity } from '@/models/Card';
import { cardSpinDuration, getActiveReelEffect } from '@/services/CardService';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const RARITY_COLOR: Record<CardRarity, string> = {
  COMMON:   Colors.textMuted,
  UNCOMMON: '#5BC6A0',
  RARE:     '#5BB0FF',
  EPIC:     '#B07BFF',
};

// ── Reel-card chip ────────────────────────────────────────────────────────
// Sits in the spin-screen modifier strip. Shows nothing when no card is
// armed; otherwise shows the card name + remaining spins, and taps open a
// dialog to deactivate (which refunds the card to inventory).
// ── Picker ────────────────────────────────────────────────────────────────
// Same component renders the picker drawer when the chip is empty + a "USE
// CARD" call-to-action is tapped. Lists every owned reel card; activate
// dispatches store.activateReelCard.

interface Props {
  // Open the picker drawer instead of just showing the chip. Toggled from
  // a parent CTA (e.g. inventory icon next to the spin button).
  pickerOpen: boolean;
  onClosePicker: () => void;
  // When false, only the picker Modal renders (the inline chip is suppressed).
  // Use `<ReelCardChip showChip={false}>` to mount the picker once at the
  // root and keep the chip rendering wherever you want it inline.
  showChip?: boolean;
}

export function ReelCardChip({ pickerOpen, onClosePicker, showChip = true }: Props) {
  const cards = useGameStore((s) => s.cards);
  const activeReelCard = useGameStore((s) => s.activeReelCard);
  const spinsLeft = useGameStore((s) => s.activeReelCardSpinsLeft);
  const activate = useGameStore((s) => s.activateReelCard);
  const deactivate = useGameStore((s) => s.deactivateReelCard);
  const shred = useGameStore((s) => s.shredCard);

  const ownedReelCards: CardDefinition[] = Object.entries(cards)
    .filter(([id, n]) => n > 0 && getCardDefinition(id)?.category === 'REEL')
    .map(([id]) => getCardDefinition(id)!)
    .filter(Boolean);

  const armedDef = activeReelCard ? getCardDefinition(activeReelCard) : null;
  const armedColor = armedDef ? RARITY_COLOR[armedDef.rarity] : Colors.accent;

  return (
    <>
      {showChip && armedDef && (
        <Pressable onPress={deactivate} style={[styles.chip, { borderColor: armedColor }]}>
          <Text style={[styles.chipName, { color: armedColor }]} numberOfLines={1}>
            {armedDef.name}
          </Text>
          <Text style={styles.chipMeta}>{spinsLeft > 1 ? `${spinsLeft} SPINS` : '1 SPIN'} · TAP TO UNDO</Text>
        </Pressable>
      )}

      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={onClosePicker}>
        <Pressable style={styles.backdrop} onPress={onClosePicker}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <Text style={styles.title}>REEL CARDS</Text>
            <Text style={styles.subtitle}>
              {ownedReelCards.length === 0
                ? 'Win spins to drop cards. Activate one to bend the next reel.'
                : `${ownedReelCards.length} card${ownedReelCards.length === 1 ? '' : 's'} ready`}
            </Text>

            <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
              {ownedReelCards.map((def) => {
                const count = cards[def.id] ?? 0;
                const color = RARITY_COLOR[def.rarity];
                const refund = SHRED_VALUE_CR[def.tier];
                const eff = getActiveReelEffect(def.id);
                const duration = cardSpinDuration(def.id);
                return (
                  <View key={def.id} style={[styles.row, { borderColor: color + '55' }]}>
                    <View style={styles.rowLeft}>
                      <Text style={[styles.rowName, { color }]}>
                        {def.name} {count > 1 ? `×${count}` : ''}
                      </Text>
                      <Text style={styles.rowDesc}>{def.description}</Text>
                      {duration > 1 && eff && (
                        <Text style={styles.rowMeta}>LASTS {duration} SPINS</Text>
                      )}
                    </View>
                    <View style={styles.rowActions}>
                      <Pressable
                        onPress={() => {
                          activate(def.id, duration);
                          onClosePicker();
                        }}
                        style={[styles.btn, { backgroundColor: color + '22', borderColor: color }]}
                      >
                        <Text style={[styles.btnText, { color }]}>USE</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => shred(def.id)}
                        style={styles.shredBtn}
                      >
                        <Text style={styles.shredText}>+{refund}</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'column',
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'flex-start',
  },
  chipName: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, letterSpacing: 1 },
  chipMeta: { fontSize: 9, color: Colors.textMuted, letterSpacing: 2, marginTop: 2 },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderTopWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    maxHeight: '78%',
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.md },
  title: { fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold, color: Colors.accent, letterSpacing: 3 },
  subtitle: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 1, marginTop: 4, marginBottom: Spacing.md },

  list: { flexGrow: 0 },
  listContent: { gap: Spacing.sm, paddingBottom: Spacing.lg },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  rowLeft: { flex: 1, gap: 2 },
  rowName: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, letterSpacing: 1 },
  rowDesc: { fontSize: Typography.sizes.xs, color: Colors.textMuted, lineHeight: 16 },
  rowMeta: { fontSize: 9, color: Colors.textMuted, letterSpacing: 1.5, marginTop: 2 },
  rowActions: { flexDirection: 'row', gap: 6 },
  btn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.sm, borderWidth: 1 },
  btnText: { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, letterSpacing: 2 },
  shredBtn: { paddingHorizontal: 8, paddingVertical: 6, borderRadius: BorderRadius.sm, backgroundColor: Colors.surface },
  shredText: { fontSize: 10, color: Colors.credits, fontWeight: Typography.weights.bold },
});
