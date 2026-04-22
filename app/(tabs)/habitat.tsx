import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useGameStore } from '@/store/useGameStore';
import { BuildingType, BUILDING_UPGRADE_COST } from '@/models/Habitat';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const BUILDING_META: Record<BuildingType, { icon: string; label: string; desc: string }> = {
  GENERATOR: { icon: '⚡', label: 'GENERATOR', desc: 'Passive credit income' },
  ARMORY: { icon: '⚔', label: 'ARMORY', desc: 'Increases max attacks' },
  VAULT: { icon: '◈', label: 'VAULT', desc: 'Reduces raid losses' },
  TURRET: { icon: '◎', label: 'TURRET', desc: 'Auto-blocks 1 attack/day' },
  HANGAR: { icon: '▲', label: 'HANGAR', desc: 'Unlocks drone mercenaries' },
};

const STARTER_BUILDINGS: BuildingType[] = ['GENERATOR', 'ARMORY', 'VAULT'];

interface BuildingCardProps {
  type: BuildingType;
  level: number;
  canAfford: boolean;
  upgradeCost: number;
  onUpgrade: () => void;
}

function BuildingCard({ type, level, canAfford, upgradeCost, onUpgrade }: BuildingCardProps) {
  const meta = BUILDING_META[type];
  const maxed = level >= 10;

  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <Text style={styles.cardIcon}>{meta.icon}</Text>
        <View>
          <Text style={styles.cardLabel}>{meta.label}</Text>
          <Text style={styles.cardDesc}>{meta.desc}</Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.cardLevel}>LVL {level}</Text>
        <Pressable
          onPress={onUpgrade}
          disabled={!canAfford || maxed}
          style={[
            styles.upgradeButton,
            (!canAfford || maxed) && styles.upgradeButtonDisabled,
          ]}
        >
          <Text style={styles.upgradeButtonText}>
            {maxed ? 'MAX' : `${upgradeCost} CR`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function HabitatScreen() {
  const { credits, subtractCredits } = useGameStore();

  // Local state for demo — will be replaced by Firestore sync in Phase 2
  function handleUpgrade(type: BuildingType, level: number) {
    const cost = BUILDING_UPGRADE_COST[type](level);
    subtractCredits(cost);
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>OUTPOST</Text>
        <Text style={styles.subtitle}>Build. Defend. Expand.</Text>
      </View>

      <View style={styles.creditsBadge}>
        <Text style={styles.creditsValue}>{credits.toLocaleString()}</Text>
        <Text style={styles.creditsLabel}> CREDITS</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {STARTER_BUILDINGS.map((type) => {
          const level = 1;
          const upgradeCost = BUILDING_UPGRADE_COST[type](level);
          return (
            <BuildingCard
              key={type}
              type={type}
              level={level}
              canAfford={credits >= upgradeCost}
              upgradeCost={upgradeCost}
              onUpgrade={() => handleUpgrade(type, level)}
            />
          );
        })}

        <View style={styles.lockedSection}>
          <Text style={styles.lockedHeader}>LOCKED — PHASE 2</Text>
          {(['TURRET', 'HANGAR'] as BuildingType[]).map((type) => (
            <View key={type} style={[styles.card, styles.cardLocked]}>
              <View style={styles.cardLeft}>
                <Text style={[styles.cardIcon, { opacity: 0.3 }]}>
                  {BUILDING_META[type].icon}
                </Text>
                <View>
                  <Text style={[styles.cardLabel, { color: Colors.textMuted }]}>
                    {BUILDING_META[type].label}
                  </Text>
                  <Text style={styles.cardDesc}>{BUILDING_META[type].desc}</Text>
                </View>
              </View>
              <Text style={styles.lockBadge}>LOCKED</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  title: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 6,
  },
  subtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginTop: 2,
  },
  creditsBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  creditsValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.credits,
  },
  creditsLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  list: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  cardLocked: {
    opacity: 0.5,
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  cardIcon: {
    fontSize: Typography.sizes.xl,
    width: 32,
    textAlign: 'center',
  },
  cardLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  cardDesc: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  cardLevel: {
    fontSize: Typography.sizes.xs,
    color: Colors.accent,
    letterSpacing: 2,
  },
  upgradeButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  upgradeButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
  },
  upgradeButtonText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  lockedSection: {
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  lockedHeader: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
    marginBottom: Spacing.xs,
  },
  lockBadge: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
