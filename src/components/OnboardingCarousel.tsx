import { useCallback, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

export const ONBOARDING_KEY = 'hasSeenOnboarding';

interface CardData {
  tab: string;
  icon: string;
  color: string;
  bullets: [string, string, string];
}

const CARDS: CardData[] = [
  {
    tab: 'SPIN',
    icon: '◈',
    color: Colors.primary,
    bullets: [
      'Spin to win Credits, Fuel Cells, and Signal Boosters',
      'Match 3 symbols for jackpot payouts — up to 2,000 CR',
      '50 max spins — refills 1 every 5 minutes, even offline',
    ],
  },
  {
    tab: 'BASE',
    icon: '⬡',
    color: Colors.credits,
    bullets: [
      'Upgrade buildings to unlock passive income and combat bonuses',
      'GENERATOR pays credits every 30 seconds automatically',
      'Build timers count down while the app is closed',
    ],
  },
  {
    tab: 'RADAR',
    icon: '◎',
    color: Colors.danger,
    bullets: [
      'Scan the sector to find other pilots to engage',
      'INTRUSION: spend a Breach token — winner takes credits',
      'EXTRACTION: higher loot, higher risk — costs a Beam token',
    ],
  },
  {
    tab: 'RIFT',
    icon: '⊗',
    color: Colors.accent,
    bullets: [
      'Activate a Temporal Rift before each spin to bias the reels',
      'Higher tiers shift weight toward jackpots and large credit wins',
      'Tier costs per spin: FREE · 50 CR · 150 CR · 400 CR',
    ],
  },
  {
    tab: 'PILOT',
    icon: '▲',
    color: Colors.info,
    bullets: [
      'View your XP, pilot level, and full combat history',
      'Every spin earns XP — jackpots award a bonus 20 XP',
      'Pilot level gates how far your Outpost can be upgraded',
    ],
  },
];

interface Props {
  onDismiss: () => void;
}

export function OnboardingCarousel({ onDismiss }: Props) {
  const { width } = useWindowDimensions();
  const flatListRef = useRef<FlatList<CardData>>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === CARDS.length - 1;

  const dismiss = useCallback(async () => {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1');
    onDismiss();
  }, [onDismiss]);

  function handleNext() {
    if (isLast) {
      dismiss();
      return;
    }
    const next = index + 1;
    flatListRef.current?.scrollToIndex({ index: next, animated: true });
    setIndex(next);
  }

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
    },
  );
  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 });

  return (
    <Modal transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <Pressable style={styles.skip} onPress={dismiss}>
          <Text style={styles.skipText}>SKIP</Text>
        </Pressable>

        <FlatList
          ref={flatListRef}
          data={CARDS}
          keyExtractor={(c) => c.tab}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig.current}
          renderItem={({ item }) => (
            <View style={[styles.slide, { width }]}>
              <View style={styles.card}>
                <View style={[styles.iconBadge, { borderColor: item.color, backgroundColor: item.color + '22' }]}>
                  <Text style={[styles.iconGlyph, { color: item.color }]}>{item.icon}</Text>
                </View>

                <Text style={[styles.tabName, { color: item.color }]}>{item.tab}</Text>

                <View style={styles.bullets}>
                  {item.bullets.map((b, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <Text style={[styles.bulletDot, { color: item.color }]}>·</Text>
                      <Text style={styles.bulletText}>{b}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}
        />

        <View style={styles.dots}>
          {CARDS.map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === index ? styles.dotActive : styles.dotInactive]}
            />
          ))}
        </View>

        <Pressable style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextText}>{isLast ? "LET'S GO" : 'NEXT  →'}</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  skip: {
    position: 'absolute',
    top: 52,
    right: Spacing.lg,
    zIndex: 10,
    padding: Spacing.sm,
  },
  skipText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  slide: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  card: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconBadge: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  iconGlyph: {
    fontSize: 36,
    lineHeight: 40,
  },
  tabName: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    letterSpacing: 6,
  },
  bullets: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-start',
  },
  bulletDot: {
    fontSize: Typography.sizes.lg,
    lineHeight: 20,
    fontWeight: Typography.weights.bold,
  },
  bulletText: {
    flex: 1,
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: Spacing.xl,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: Colors.primary,
    width: 18,
  },
  dotInactive: {
    backgroundColor: Colors.border,
  },
  nextButton: {
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
    minWidth: 180,
    alignItems: 'center',
  },
  nextText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
    letterSpacing: 3,
  },
});
