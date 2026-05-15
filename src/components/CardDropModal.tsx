import { useEffect } from 'react';
import { View, Text, Modal, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';
import { useGameStore } from '@/store/useGameStore';
import { SHRED_VALUE_CR } from '@/models/Card';
import type { CardDefinition, CardRarity } from '@/models/Card';
import type { CardDrop } from '@/services/CardService';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { hapticBuildStart } from '@/constants/haptics';

const RARITY_COLOR: Record<CardRarity, string> = {
  COMMON:   Colors.textMuted,
  UNCOMMON: '#5BC6A0',
  RARE:     '#5BB0FF',
  EPIC:     '#B07BFF',
};

const CATEGORY_LABEL = { REEL: 'REEL CARD', RAID: 'RAID CARD' } as const;

function rewardSubtitle(card: CardDefinition): string {
  return card.synergies?.length ? `SYNERGY · ${card.synergies.join(' · ')}` : card.flavor ?? '';
}

interface Props {
  drop: CardDrop | null;
  onClose: () => void;
}

export function CardDropModal({ drop, onClose }: Props) {
  const shred = useGameStore((s) => s.shredCard);
  const cards = useGameStore((s) => s.cards);
  const scale = useSharedValue(0.85);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (drop) {
      scale.value = withSpring(1, { damping: 14, stiffness: 180 });
      opacity.value = withTiming(1, { duration: 220 });
    } else {
      scale.value = 0.85;
      opacity.value = 0;
    }
  }, [drop]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!drop) return null;

  // Auto-shredded drops show a brief banner only, no choice — the inventory
  // was at cap so the card already paid out as CR. The modal closes itself.
  const autoShredded = drop.autoShredded;
  const card = drop.card;
  const rarityColor = RARITY_COLOR[card.rarity];
  const refund = SHRED_VALUE_CR[card.tier];
  const ownedCount = cards[card.id] ?? 0;

  return (
    <Modal visible={!!drop} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={autoShredded ? onClose : undefined}>
        <Animated.View style={[styles.cardWrap, cardStyle]}>
          <Pressable onPress={() => {}}>
            <LinearGradient
              colors={[rarityColor + '88', rarityColor + '11', 'transparent']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={[styles.card, { borderColor: rarityColor }]}
            >
              <Text style={[styles.eyebrow, { color: rarityColor }]}>
                {card.tier === 'MAJOR' ? '★ ' : ''}{CATEGORY_LABEL[card.category]} · {card.rarity}
              </Text>
              <Text style={styles.name}>{card.name}</Text>
              <Text style={styles.desc}>{card.description}</Text>
              {!!rewardSubtitle(card) && (
                <Text style={[styles.synergy, { color: rarityColor }]}>{rewardSubtitle(card)}</Text>
              )}

              {autoShredded ? (
                <View style={styles.autoBanner}>
                  <Text style={styles.autoLabel}>INVENTORY FULL</Text>
                  <Text style={styles.autoValue}>+{drop.shredCredits.toLocaleString()} CR</Text>
                </View>
              ) : (
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => { hapticBuildStart(); onClose(); }}
                    style={[styles.btn, styles.keepBtn, { borderColor: rarityColor }]}
                  >
                    <Text style={[styles.btnText, { color: rarityColor }]}>ADD</Text>
                    {ownedCount > 0 && (
                      <Text style={styles.stackHint}>×{ownedCount + 1}</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => { shred(card.id); onClose(); }}
                    style={[styles.btn, styles.shredBtn]}
                  >
                    <Text style={[styles.btnText, { color: Colors.credits }]}>
                      SHRED  +{refund.toLocaleString()} CR
                    </Text>
                  </Pressable>
                </View>
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', padding: Spacing.lg },
  cardWrap: { width: '100%', maxWidth: 360 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    gap: Spacing.sm,
  },
  eyebrow: { fontSize: Typography.sizes.xs, letterSpacing: 3, fontWeight: Typography.weights.bold },
  name: { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: Colors.text, letterSpacing: 1.5 },
  desc: { fontSize: Typography.sizes.sm, color: Colors.textMuted, lineHeight: 20 },
  synergy: { fontSize: Typography.sizes.xs, letterSpacing: 2 },
  actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  btn: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  keepBtn: { borderWidth: 1, backgroundColor: Colors.surfaceElevated },
  shredBtn: { backgroundColor: Colors.surfaceElevated },
  btnText: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, letterSpacing: 2 },
  stackHint: { fontSize: Typography.sizes.xs, color: Colors.textMuted, marginTop: 2 },
  autoBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.sm,
  },
  autoLabel: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 2 },
  autoValue: { fontSize: Typography.sizes.md, fontWeight: Typography.weights.bold, color: Colors.credits },
});
