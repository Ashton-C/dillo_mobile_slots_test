import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
import {
  COSMETICS_CATALOG,
  CosmeticCategory,
  CosmeticItem,
} from '@/services/CosmeticsService';
import { CosmeticPreview } from '@/components/CosmeticPreview';
import { hapticActivateBuff } from '@/constants/haptics';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

interface Props {
  label: string;
  category: CosmeticCategory;
  onLockedPress: (item: CosmeticItem) => void;
  onEquipped?: (item: CosmeticItem) => void;
}

// Horizontal-scrolling row of cosmetic tiles for a single category. Tapping an
// owned tile equips it; tapping a locked tile delegates to the parent (which
// typically opens a purchase modal).
export function CosmeticCategoryGrid({ label, category, onLockedPress, onEquipped }: Props) {
  const equipCosmetic = useCosmeticsStore((s) => s.equip);
  const isOwned       = useCosmeticsStore((s) => s.isOwned);
  const getActive     = useCosmeticsStore((s) => s.getActive);
  const items         = COSMETICS_CATALOG.filter((c) => c.category === category);
  const activeId      = getActive(category);
  if (items.length === 0) return null;

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {items.map((item) => {
          const owned  = isOwned(item.id);
          const active = activeId === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => {
                Haptics.selectionAsync();
                if (owned) {
                  equipCosmetic(item.id);
                  hapticActivateBuff();
                  onEquipped?.(item);
                } else {
                  onLockedPress(item);
                }
              }}
              style={[
                styles.tile,
                active && { borderColor: item.previewColor ?? Colors.primary, borderWidth: 2 },
                !owned && styles.tileLocked,
              ]}
            >
              <View style={!owned ? styles.previewLocked : undefined}>
                <CosmeticPreview category={item.category} itemId={item.id} accentColor={item.previewColor ?? Colors.primary} />
              </View>
              <Text style={[styles.name, !owned && { color: Colors.textMuted }]} numberOfLines={1}>{item.name}</Text>
              <Text style={[styles.badge, owned ? styles.badgeOwned : styles.badgeLocked]}>
                {active ? 'ACTIVE' : owned ? 'OWNED' : item.creditCost > 0 ? `${item.creditCost} CR` : (item.iapPrice ?? 'IAP')}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
    alignSelf: 'flex-start',
    marginBottom: 6,
    marginTop: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: Spacing.md,
  },
  tile: {
    width: 90,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 6,
    alignItems: 'center',
    gap: 4,
  },
  tileLocked: {
    opacity: 0.55,
  },
  previewLocked: {
    opacity: 0.4,
  },
  name: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  badge: {
    fontSize: 8,
    letterSpacing: 1,
    fontWeight: Typography.weights.bold,
  },
  badgeOwned: {
    color: Colors.success,
  },
  badgeLocked: {
    color: Colors.credits,
  },
});
