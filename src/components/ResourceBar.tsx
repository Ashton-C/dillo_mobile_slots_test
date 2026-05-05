import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { CreditCounter } from '@/components/CreditCounter';
import { HUD_SKIN_TOKENS, EMBLEM_GLYPHS, TITLE_LABELS, SUIT_COLOR_MAP } from '@/services/CosmeticsService';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';

interface ResourcePillProps {
  label: string;
  value: number;
  color: string;
}

function ResourcePill({ label, value, color }: ResourcePillProps) {
  return (
    <View style={styles.pill}>
      <Text style={[styles.pillValue, { color }]}>{value.toLocaleString()}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

function CreditPill({ credits }: { credits: number }) {
  return (
    <View style={styles.pill}>
      <CreditCounter value={credits} color={Colors.credits} style={styles.pillValue} />
      <Text style={styles.pillLabel}>CREDITS</Text>
    </View>
  );
}

interface Props {
  credits: number;
  attacks: number;
  raids: number;
  shields: number;
  spinsRemaining: number;
  displayName?: string;
  style?: ViewStyle;
}

export function ResourceBar({ credits, attacks, raids, shields, spinsRemaining, displayName, style }: Props) {
  const activeHudId    = useCosmeticsStore((s) => s.active['HUD_SKIN']   ?? 'hud_default');
  const activeEmblemId = useCosmeticsStore((s) => s.active['EMBLEM']     ?? 'emblem_none');
  const activeTitleId  = useCosmeticsStore((s) => s.active['TITLE']      ?? 'title_none');
  const activeSuitId   = useCosmeticsStore((s) => s.active['SUIT_COLOR'] ?? 'suit_default');

  const hud     = HUD_SKIN_TOKENS[activeHudId]    ?? HUD_SKIN_TOKENS.hud_default;
  const emblem  = EMBLEM_GLYPHS[activeEmblemId]   ?? '';
  const title   = TITLE_LABELS[activeTitleId]     ?? '';
  const suitColor = SUIT_COLOR_MAP[activeSuitId]  ?? Colors.primary;

  const spinsColor = spinsRemaining <= 5 ? Colors.warning : Colors.accent;

  const pilotLabel = [title, displayName].filter(Boolean).join(' ');

  return (
    <View style={[styles.container, { backgroundColor: hud.backgroundColor, borderBottomColor: hud.borderColor }, style]}>
      {pilotLabel ? (
        <View style={styles.pilotRow}>
          {emblem ? <Text style={[styles.emblem, { color: suitColor }]}>{emblem} </Text> : null}
          <Text style={[styles.pilotName, { color: suitColor }]} numberOfLines={1}>{pilotLabel}</Text>
        </View>
      ) : null}
      <View style={styles.pillsRow}>
        <CreditPill credits={credits} />
        <ResourcePill label="FUEL"    value={attacks}        color={Colors.attack}  />
        <ResourcePill label="BOOST"   value={raids}          color={Colors.raid}    />
        <ResourcePill label="SHIELDS" value={shields}        color={Colors.shield}  />
        <ResourcePill label="SPINS"   value={spinsRemaining} color={spinsColor}     />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pilotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 2,
  },
  emblem: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
  },
  pilotName: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
    color: Colors.textSecondary,
  },
  pillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
  },
  pill: {
    alignItems: 'center',
  },
  pillValue: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    lineHeight: 20,
  },
  pillLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
});
