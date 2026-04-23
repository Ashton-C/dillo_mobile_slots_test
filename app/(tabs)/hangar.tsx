import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DroneCard } from '@/components/DroneCard';
import { useDroneStore } from '@/store/useDroneStore';
import { useGameStore } from '@/store/useGameStore';
import { DRONE_CONTRACTS, DroneType } from '@/models/Drone';
import { droneService } from '@/services/DroneMercenaryService';
import { Colors, Typography, Spacing } from '@/constants/theme';

const DRONE_ORDER: DroneType[] = ['SENTINEL', 'SCRAMBLER', 'HARVESTER', 'RAIDER'];

export default function HangarScreen() {
  const { activeDrones, deployDrone } = useDroneStore();
  const { credits, attacks, raids, shields, subtractCredits, consumeAttack, consumeRaid, consumeShield } = useGameStore();

  const resources = { credits, attacks, raids, shields };

  function handleDeploy(type: DroneType) {
    const result = deployDrone(type, resources);
    if (!result.success) return;

    // Deduct costs from game store
    if (result.costPaid.credits) subtractCredits(result.costPaid.credits);
    if (result.costPaid.attacks) consumeAttack();
    if (result.costPaid.raids) consumeRaid();
    if (result.costPaid.shields) consumeShield();
  }

  const effects = droneService.computeEffects(activeDrones);
  const hasActiveDrones = activeDrones.length > 0;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>HANGAR</Text>
        <Text style={styles.subtitle}>Deploy. Defend. Dominate.</Text>
      </View>

      {hasActiveDrones && (
        <View style={styles.effectsBar}>
          <Text style={styles.effectsLabel}>ACTIVE EFFECTS</Text>
          <View style={styles.effectsRow}>
            {effects.creditMultiplier > 1 && (
              <Text style={[styles.effectChip, { color: Colors.credits }]}>
                ×{effects.creditMultiplier.toFixed(2)} CREDITS
              </Text>
            )}
            {effects.raidLootBonus > 0 && (
              <Text style={[styles.effectChip, { color: Colors.raid }]}>
                +{Math.round(effects.raidLootBonus * 100)}% RAID LOOT
              </Text>
            )}
            {effects.blocksNextAttack && (
              <Text style={[styles.effectChip, { color: Colors.shield }]}>
                ATTACK BLOCKED
              </Text>
            )}
            {effects.blocksNextRaid && (
              <Text style={[styles.effectChip, { color: Colors.accent }]}>
                RAID BLOCKED
              </Text>
            )}
          </View>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.list}>
        <Text style={styles.sectionHeader}>MERCENARY CONTRACTS</Text>
        {DRONE_ORDER.map((type) => {
          const contract = DRONE_CONTRACTS[type];
          const canAfford = droneService.canAfford(contract, resources);
          return (
            <DroneCard
              key={type}
              contract={contract}
              activeDrones={activeDrones}
              canAfford={canAfford}
              onDeploy={() => handleDeploy(type)}
            />
          );
        })}
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
  effectsBar: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    padding: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  effectsLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginBottom: Spacing.xs,
  },
  effectsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  effectChip: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  list: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  sectionHeader: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
    marginBottom: Spacing.xs,
  },
});
