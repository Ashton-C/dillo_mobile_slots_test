import { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useGameStore } from '@/store/useGameStore';
import { CARD_CATALOG, SHRED_VALUE_CR, getCardDefinition } from '@/models/Card';
import type { CardCategory, CardDefinition, CardRarity } from '@/models/Card';
import { cardSpinDuration } from '@/services/CardService';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const RARITY_COLOR: Record<CardRarity, string> = {
  COMMON:   Colors.textMuted,
  UNCOMMON: '#5BC6A0',
  RARE:     '#5BB0FF',
  EPIC:     '#B07BFF',
};

type Filter = 'ALL' | 'REEL' | 'RAID';

export default function InventoryScreen() {
  const router = useRouter();
  const cards = useGameStore((s) => s.cards);
  const activeReelCard = useGameStore((s) => s.activeReelCard);
  const activeSpinsLeft = useGameStore((s) => s.activeReelCardSpinsLeft);
  const activate = useGameStore((s) => s.activateReelCard);
  const deactivate = useGameStore((s) => s.deactivateReelCard);
  const shred = useGameStore((s) => s.shredCard);
  const [filter, setFilter] = useState<Filter>('ALL');

  const owned: { def: CardDefinition; count: number }[] = Object.entries(cards)
    .map(([id, count]) => ({ def: getCardDefinition(id), count }))
    .filter((row): row is { def: CardDefinition; count: number } => row.def !== undefined && row.count > 0)
    .filter((row) => filter === 'ALL' ? true : row.def.category === filter)
    // Stable order: rarity desc, then name.
    .sort((a, b) => {
      const r = (RARITY_RANK[b.def.rarity] - RARITY_RANK[a.def.rarity]);
      if (r !== 0) return r;
      return a.def.name.localeCompare(b.def.name);
    });

  const totalOwned = Object.values(cards).reduce((n, c) => n + c, 0);
  const totalUnique = owned.length;
  const totalCatalog = CARD_CATALOG.length;

  return (
    <SafeAreaView style={styles.root}>
      <LinearGradient
        colors={[Colors.accent + '22', Colors.gradientEnd + '11', 'transparent']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← BACK</Text>
        </Pressable>
        <View>
          <Text style={styles.title}>CARD INVENTORY</Text>
          <Text style={styles.subtitle}>
            {totalOwned} total · {totalUnique} unique · {totalCatalog} discoverable
          </Text>
        </View>
      </LinearGradient>

      <View style={styles.filterRow}>
        {(['ALL', 'REEL', 'RAID'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      {activeReelCard && filter !== 'RAID' && (
        <View style={styles.activeBanner}>
          <Text style={styles.activeLabel}>ARMED · {activeSpinsLeft > 1 ? `${activeSpinsLeft} SPINS` : '1 SPIN'}</Text>
          <Text style={styles.activeName}>{getCardDefinition(activeReelCard)?.name ?? '—'}</Text>
          <Pressable onPress={deactivate} style={styles.activeBtn}>
            <Text style={styles.activeBtnText}>UNARM (REFUND)</Text>
          </Pressable>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
        {owned.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>NO CARDS YET</Text>
            <Text style={styles.emptyHint}>
              Spin to win — cards drop on roughly 1 in 67 spins. Major cards are rare drops.
            </Text>
          </View>
        )}

        {owned.map(({ def, count }) => {
          const color = RARITY_COLOR[def.rarity];
          const refund = SHRED_VALUE_CR[def.tier];
          const duration = cardSpinDuration(def.id);
          const isArmed = activeReelCard === def.id;
          return (
            <View key={def.id} style={[styles.row, { borderColor: color + '55' }]}>
              <View style={styles.rowHeader}>
                <View style={[styles.rarityDot, { backgroundColor: color }]} />
                <Text style={[styles.rowName, { color }]}>
                  {def.name}
                </Text>
                <Text style={styles.rowCount}>×{count}</Text>
              </View>
              <Text style={styles.rowDesc}>{def.description}</Text>
              <View style={styles.rowMetaRow}>
                <Text style={styles.rowMeta}>{def.category} · {def.tier} · {def.rarity}</Text>
                {def.synergies?.length ? (
                  <Text style={[styles.rowMeta, { color: Colors.accent }]}>
                    SYNERGY · {def.synergies.join(' · ')}
                  </Text>
                ) : null}
              </View>
              <View style={styles.rowActions}>
                {def.category === 'REEL' && !isArmed && (
                  <Pressable
                    onPress={() => activate(def.id, duration)}
                    style={[styles.actionBtn, { backgroundColor: color + '22', borderColor: color }]}
                  >
                    <Text style={[styles.actionText, { color }]}>ARM</Text>
                  </Pressable>
                )}
                {def.category === 'REEL' && isArmed && (
                  <Pressable
                    onPress={deactivate}
                    style={[styles.actionBtn, { backgroundColor: Colors.warning + '22', borderColor: Colors.warning }]}
                  >
                    <Text style={[styles.actionText, { color: Colors.warning }]}>UNARM</Text>
                  </Pressable>
                )}
                {def.category === 'RAID' && (
                  <Text style={styles.raidHint}>USE FROM RAID SCREEN</Text>
                )}
                <Pressable onPress={() => shred(def.id)} style={styles.shredBtn}>
                  <Text style={styles.shredText}>SHRED · +{refund} CR</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const RARITY_RANK: Record<CardRarity, number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  EPIC: 3,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm, paddingBottom: Spacing.md, gap: 6 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 2, fontWeight: Typography.weights.bold },
  title: { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: Colors.accent, letterSpacing: 3 },
  subtitle: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 1, marginTop: 2 },

  filterRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.sm },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surfaceElevated },
  filterChipActive: { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' },
  filterText: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 2, fontWeight: Typography.weights.bold },
  filterTextActive: { color: Colors.accent },

  activeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.accent + '11',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  activeLabel: { fontSize: 9, letterSpacing: 2, color: Colors.accent, fontWeight: Typography.weights.bold },
  activeName: { flex: 1, fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, color: Colors.text },
  activeBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 4, backgroundColor: Colors.surfaceElevated, borderRadius: BorderRadius.sm },
  activeBtnText: { fontSize: 10, color: Colors.warning, letterSpacing: 2, fontWeight: Typography.weights.bold },

  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl, gap: Spacing.sm },

  empty: { alignItems: 'center', paddingVertical: Spacing.xxl, gap: 6 },
  emptyTitle: { fontSize: Typography.sizes.md, color: Colors.textMuted, letterSpacing: 3, fontWeight: Typography.weights.bold },
  emptyHint: { fontSize: Typography.sizes.xs, color: Colors.textMuted, textAlign: 'center', lineHeight: 18, maxWidth: 280 },

  row: {
    padding: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    gap: 4,
  },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rarityDot: { width: 8, height: 8, borderRadius: 4 },
  rowName: { flex: 1, fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, letterSpacing: 1 },
  rowCount: { fontSize: Typography.sizes.sm, color: Colors.textSecondary, fontWeight: Typography.weights.bold },
  rowDesc: { fontSize: Typography.sizes.xs, color: Colors.textMuted, lineHeight: 16 },
  rowMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.sm, flexWrap: 'wrap' },
  rowMeta: { fontSize: 9, color: Colors.textMuted, letterSpacing: 1.5 },
  rowActions: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'center', marginTop: 4 },
  actionBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: BorderRadius.sm, borderWidth: 1 },
  actionText: { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, letterSpacing: 2 },
  raidHint: { fontSize: 10, color: Colors.textMuted, letterSpacing: 1.5, flex: 1 },
  shredBtn: { marginLeft: 'auto', paddingHorizontal: Spacing.sm, paddingVertical: 6, backgroundColor: Colors.surface, borderRadius: BorderRadius.sm },
  shredText: { fontSize: 10, color: Colors.credits, fontWeight: Typography.weights.bold, letterSpacing: 1 },
});
