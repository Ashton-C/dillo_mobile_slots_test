import { View, Text, Modal, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameStore } from '@/store/useGameStore';
import { getCardDefinition } from '@/models/Card';
import type { CardDefinition, CardRarity } from '@/models/Card';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const RARITY_COLOR: Record<CardRarity, string> = {
  COMMON:   Colors.textMuted,
  UNCOMMON: '#5BC6A0',
  RARE:     '#5BB0FF',
  EPIC:     '#B07BFF',
};

interface Props {
  visible: boolean;
  // The combat type is shown in the header so players know which raid
  // they're picking a card for.
  combatType: 'INTRUSION' | 'EXTRACTION';
  // Called with the chosen card id, or null when the player taps SKIP.
  onPick: (cardId: string | null) => void;
  onCancel: () => void;
}

export function PreRaidCardModal({ visible, combatType, onPick, onCancel }: Props) {
  const cards = useGameStore((s) => s.cards);

  const ownedRaidCards: CardDefinition[] = Object.entries(cards)
    .filter(([id, n]) => n > 0 && getCardDefinition(id)?.category === 'RAID')
    .map(([id]) => getCardDefinition(id)!)
    .filter(Boolean);

  const headerLabel = combatType === 'INTRUSION' ? 'BREACH LOADOUT' : 'EXTRACTION LOADOUT';
  const headerColor = combatType === 'INTRUSION' ? Colors.danger : Colors.accent;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <LinearGradient
            colors={[headerColor + '33', headerColor + '11', 'transparent']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={styles.header}
          >
            <Text style={[styles.title, { color: headerColor }]}>{headerLabel}</Text>
            <Text style={styles.subtitle}>
              {ownedRaidCards.length === 0
                ? 'No raid cards in stash. Win cards from spins to load up.'
                : 'Pick one card to fire alongside this raid. Cards burn on use.'}
            </Text>
          </LinearGradient>

          <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
            {ownedRaidCards.map((def) => {
              const count = cards[def.id] ?? 0;
              const color = RARITY_COLOR[def.rarity];
              return (
                <Pressable
                  key={def.id}
                  onPress={() => onPick(def.id)}
                  style={[styles.row, { borderColor: color + '55' }]}
                >
                  <View style={styles.rowLeft}>
                    <Text style={[styles.rowName, { color }]}>
                      {def.name} {count > 1 ? `×${count}` : ''}
                    </Text>
                    <Text style={styles.rowDesc}>{def.description}</Text>
                  </View>
                  <View style={[styles.usePill, { borderColor: color }]}>
                    <Text style={[styles.usePillText, { color }]}>USE</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable onPress={() => onPick(null)} style={styles.skipBtn}>
              <Text style={styles.skipText}>SKIP · NO CARD</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingBottom: Spacing.xxl,
    maxHeight: '82%',
  },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginTop: Spacing.sm },
  header: { padding: Spacing.lg, gap: 4 },
  title: { fontSize: Typography.sizes.lg, fontWeight: Typography.weights.bold, letterSpacing: 3 },
  subtitle: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 1, lineHeight: 18 },

  list: { flexGrow: 0 },
  listContent: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },

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
  usePill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  usePillText: { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, letterSpacing: 2 },

  actions: { padding: Spacing.lg, paddingTop: Spacing.sm },
  skipBtn: {
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  skipText: { fontSize: Typography.sizes.sm, color: Colors.textSecondary, letterSpacing: 2, fontWeight: Typography.weights.bold },
});
