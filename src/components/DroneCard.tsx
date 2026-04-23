import { View, Text, Pressable, StyleSheet } from 'react-native';
import { DroneContract, DroneType, ActiveDrone } from '@/models/Drone';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const DRONE_ICONS: Record<DroneType, string> = {
  SENTINEL: '◉',
  SCRAMBLER: '◈',
  HARVESTER: '⚡',
  RAIDER: '⛏',
};

const DRONE_COLORS: Record<DroneType, string> = {
  SENTINEL: Colors.shield,
  SCRAMBLER: Colors.accent,
  HARVESTER: Colors.credits,
  RAIDER: Colors.raid,
};

interface CostPillProps {
  label: string;
  value: number;
  color: string;
}

function CostPill({ label, value, color }: CostPillProps) {
  if (value === 0) return null;
  return (
    <View style={styles.costPill}>
      <Text style={[styles.costValue, { color }]}>{value}</Text>
      <Text style={styles.costLabel}>{label}</Text>
    </View>
  );
}

interface Props {
  contract: DroneContract;
  activeDrones: ActiveDrone[];
  canAfford: boolean;
  onDeploy: () => void;
}

export function DroneCard({ contract, activeDrones, canAfford, onDeploy }: Props) {
  const activeCount = activeDrones.filter((d) => d.type === contract.type).length;
  const atMax = activeCount >= contract.maxDeployed;
  const color = DRONE_COLORS[contract.type];

  // Find active spin-countdown drones of this type
  const spinDrones = activeDrones.filter(
    (d) => d.type === contract.type && d.spinsRemaining !== null,
  );

  return (
    <View style={[styles.card, atMax && styles.cardActive]}>
      <View style={styles.header}>
        <View style={[styles.iconBadge, { borderColor: color }]}>
          <Text style={[styles.icon, { color }]}>{DRONE_ICONS[contract.type]}</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={[styles.label, { color }]}>{contract.label}</Text>
          <Text style={styles.description}>{contract.description}</Text>
        </View>
        <View style={styles.countBadge}>
          <Text style={[styles.countText, { color }]}>
            {activeCount}/{contract.maxDeployed}
          </Text>
          <Text style={styles.countSubtext}>ACTIVE</Text>
        </View>
      </View>

      {spinDrones.length > 0 && (
        <View style={styles.spinCounters}>
          {spinDrones.map((d) => (
            <View key={d.id} style={[styles.spinPill, { borderColor: color }]}>
              <Text style={[styles.spinPillText, { color }]}>
                {d.spinsRemaining} spins left
              </Text>
            </View>
          ))}
        </View>
      )}

      <Text style={styles.flavour}>{contract.flavour}</Text>

      <View style={styles.footer}>
        <View style={styles.costs}>
          <CostPill label="CR" value={contract.cost.credits} color={Colors.credits} />
          <CostPill label="ATK" value={contract.cost.attacks} color={Colors.attack} />
          <CostPill label="RAID" value={contract.cost.raids} color={Colors.raid} />
          <CostPill label="SHD" value={contract.cost.shields} color={Colors.shield} />
        </View>

        <Pressable
          onPress={onDeploy}
          disabled={!canAfford || atMax}
          style={[
            styles.deployButton,
            { borderColor: color },
            (!canAfford || atMax) && styles.deployButtonDisabled,
          ]}
        >
          <Text style={[styles.deployText, { color: canAfford && !atMax ? color : Colors.textMuted }]}>
            {atMax ? 'MAXED' : 'DEPLOY'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardActive: {
    borderColor: Colors.surfaceElevated,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceElevated,
  },
  icon: {
    fontSize: Typography.sizes.lg,
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  description: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    lineHeight: 16,
  },
  countBadge: {
    alignItems: 'center',
  },
  countText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
  },
  countSubtext: {
    fontSize: 8,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  spinCounters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  spinPill: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  spinPillText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  flavour: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  costs: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  costPill: {
    alignItems: 'center',
  },
  costValue: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  costLabel: {
    fontSize: 8,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  deployButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  deployButtonDisabled: {
    borderColor: Colors.border,
  },
  deployText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
});
