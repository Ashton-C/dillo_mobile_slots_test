import { View, Text, Modal, StyleSheet, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useDroneStore } from '@/store/useDroneStore';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { DRONE_CONTRACTS, DroneType } from '@/models/Drone';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const DRONE_ICONS: Record<DroneType, string> = {
  SENTINEL:  '◉',
  SCRAMBLER: '◈',
  HARVESTER: '⚡',
  RAIDER:    '▲',
};

const DRONE_COLORS: Record<DroneType, string> = {
  SENTINEL:  Colors.shield,
  SCRAMBLER: Colors.accent,
  HARVESTER: Colors.credits,
  RAIDER:    Colors.raid,
};

function formatDuration(type: DroneType): string {
  const { trigger, duration } = DRONE_CONTRACTS[type];
  if (trigger === 'ON_SPIN') return `${duration} spins`;
  return '1 use';
}

function formatCost(type: DroneType): string {
  const { cost } = DRONE_CONTRACTS[type];
  const parts: string[] = [];
  if (cost.credits) parts.push(`${cost.credits} CR`);
  if (cost.attacks) parts.push(`${cost.attacks} FUEL`);
  if (cost.raids)   parts.push(`${cost.raids} BOOST`);
  if (cost.shields) parts.push(`${cost.shields} SHIELD`);
  return parts.join('  +  ');
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function DroneMarketplace({ visible, onClose }: Props) {
  const { activeDrones, deployDrone } = useDroneStore();
  const { credits, attacks, raids, shields, subtractResources } = useGameStore();
  const hangarLevel = useHabitatStore((s) => s.buildingLevels['HANGAR'] ?? 0);

  const maxSlots = hangarLevel;
  const usedSlots = activeDrones.length;

  function canAfford(type: DroneType): boolean {
    const { cost } = DRONE_CONTRACTS[type];
    return credits  >= (cost.credits  ?? 0)
        && attacks  >= (cost.attacks  ?? 0)
        && raids    >= (cost.raids    ?? 0)
        && shields  >= (cost.shields  ?? 0);
  }

  function activeCount(type: DroneType): number {
    return activeDrones.filter((d) => d.type === type).length;
  }

  function hire(type: DroneType) {
    if (usedSlots >= maxSlots || !canAfford(type)) return;
    const result = deployDrone(type, { credits, attacks, raids, shields });
    if (result.success) {
      subtractResources({
        credits: result.costPaid.credits  ?? 0,
        attacks: result.costPaid.attacks  ?? 0,
        raids:   result.costPaid.raids    ?? 0,
        shields: result.costPaid.shields  ?? 0,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>

          {/* Header */}
          <LinearGradient
            colors={[Colors.gradientStart + '33', Colors.gradientEnd + '22', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.title}>DRONE CONTRACTS</Text>
                <Text style={styles.slotStatus}>
                  {usedSlots} / {maxSlots} SLOTS ACTIVE
                  {usedSlots >= maxSlots && '  ·  FULL'}
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
          </LinearGradient>

          <ScrollView contentContainerStyle={styles.list}>
            {(Object.keys(DRONE_CONTRACTS) as DroneType[]).map((type) => {
              const contract = DRONE_CONTRACTS[type];
              const color = DRONE_COLORS[type];
              const count = activeCount(type);
              const atMax = count >= contract.maxDeployed;
              const affordable = canAfford(type);
              const noSlots = usedSlots >= maxSlots;
              const disabled = noSlots || atMax || !affordable;

              let buttonLabel: string;
              if (atMax)       buttonLabel = 'AT MAX';
              else if (noSlots) buttonLabel = 'NO SLOTS';
              else if (!affordable) buttonLabel = 'COST';
              else              buttonLabel = 'HIRE';

              return (
                <View key={type} style={[styles.card, { borderColor: count > 0 ? color : Colors.border }]}>
                  <LinearGradient
                    colors={[color + '22', 'transparent']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.cardStripe}
                  />

                  <View style={styles.cardBody}>
                    <View style={[styles.iconBadge, { borderColor: color, backgroundColor: color + '18' }]}>
                      <Text style={[styles.iconText, { color }]}>{DRONE_ICONS[type]}</Text>
                    </View>

                    <View style={styles.cardInfo}>
                      <View style={styles.cardTitleRow}>
                        <Text style={[styles.droneName, { color }]}>{contract.label}</Text>
                        {count > 0 && (
                          <View style={[styles.activePill, { borderColor: color }]}>
                            <Text style={[styles.activePillText, { color }]}>{count} ACTIVE</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.droneDesc}>{contract.description}</Text>
                      <Text style={styles.droneFlavour}>{contract.flavour}</Text>
                      <Text style={[styles.droneDuration, { color }]}>
                        ◷  {formatDuration(type)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardFooter}>
                    <Text style={styles.costLabel}>{formatCost(type)}</Text>
                    <Pressable
                      onPress={() => hire(type)}
                      disabled={disabled}
                      style={[
                        styles.hireButton,
                        disabled ? styles.hireButtonDisabled : { backgroundColor: color },
                      ]}
                    >
                      <Text style={[styles.hireButtonText, disabled && styles.hireButtonTextDisabled]}>
                        {buttonLabel}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            <Text style={styles.footnote}>
              Active drone slots = HANGAR level. Upgrade your HANGAR to deploy more drones simultaneously.
            </Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    maxHeight: '90%',
  },
  headerGradient: {
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: Typography.sizes.lg,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 4,
  },
  slotStatus: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: Typography.sizes.md,
    color: Colors.textMuted,
  },
  list: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardStripe: {
    height: 3,
  },
  cardBody: {
    flexDirection: 'row',
    padding: Spacing.md,
    gap: Spacing.md,
    alignItems: 'flex-start',
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  iconText: {
    fontSize: Typography.sizes.lg,
  },
  cardInfo: {
    flex: 1,
    gap: 3,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  droneName: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  activePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  activePillText: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  droneDesc: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  droneFlavour: {
    fontSize: 10,
    color: Colors.textMuted,
    fontStyle: 'italic',
    lineHeight: 15,
    marginTop: 1,
  },
  droneDuration: {
    fontSize: Typography.sizes.xs,
    letterSpacing: 1,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  costLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  hireButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    minWidth: 72,
  },
  hireButtonDisabled: {
    backgroundColor: Colors.surfaceElevated,
  },
  hireButtonText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.background,
    letterSpacing: 2,
  },
  hireButtonTextDisabled: {
    color: Colors.textMuted,
  },
  footnote: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginTop: Spacing.xs,
  },
});
