import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { CreditCounter } from '@/components/CreditCounter';
import { HUD_SKIN_TOKENS, EMBLEM_GLYPHS, TITLE_LABELS, SUIT_COLOR_MAP } from '@/services/CosmeticsService';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
import { useGameStore } from '@/store/useGameStore';
import { useAuthStore } from '@/store/useAuthStore';

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
  // All values are optional — when omitted, the bar pulls live values from
  // useGameStore directly. This makes the bar drop-in for the global tabs
  // layout while still allowing per-screen overrides if needed.
  credits?: number;
  stardust?: number;
  attacks?: number;
  raids?: number;
  shields?: number;
  spinsRemaining?: number;
  displayName?: string;
  level?: number;
  style?: ViewStyle;
  // Compact mode trims the pilot row + pill padding for places where the
  // bar is rendered globally above a tab navigator.
  compact?: boolean;
}

export function ResourceBar(props: Props) {
  // Subscribe to the store fields the bar actually renders. We use one
  // `useGameStore(s => ...)` call per field so renders are scoped to the
  // values that change, not every store action.
  const storeCredits        = useGameStore((s) => s.credits);
  const storeStardust       = useGameStore((s) => s.stardust);
  const storeAttacks        = useGameStore((s) => s.attacks);
  const storeRaids          = useGameStore((s) => s.raids);
  const storeShields        = useGameStore((s) => s.shields);
  const storeSpinsRemaining = useGameStore((s) => s.spinsRemaining);
  const storeLevel          = useGameStore((s) => s.level);
  const storeDisplayName    = useAuthStore((s) => s.displayName);

  const credits        = props.credits        ?? storeCredits;
  const stardust       = props.stardust       ?? storeStardust;
  const attacks        = props.attacks        ?? storeAttacks;
  const raids          = props.raids          ?? storeRaids;
  const shields        = props.shields        ?? storeShields;
  const spinsRemaining = props.spinsRemaining ?? storeSpinsRemaining;
  const level          = props.level          ?? storeLevel;
  const displayName    = props.displayName    ?? storeDisplayName ?? undefined;
  const { style, compact } = props;

  const activeHudId    = useCosmeticsStore((s) => s.active['HUD_SKIN']   ?? 'hud_default');
  const activeEmblemId = useCosmeticsStore((s) => s.active['EMBLEM']     ?? 'emblem_none');
  const activeTitleId  = useCosmeticsStore((s) => s.active['TITLE']      ?? 'title_none');
  const activeSuitId   = useCosmeticsStore((s) => s.active['SUIT_COLOR'] ?? 'suit_default');

  const hud     = HUD_SKIN_TOKENS[activeHudId]    ?? HUD_SKIN_TOKENS.hud_default;
  const emblem  = EMBLEM_GLYPHS[activeEmblemId]   ?? '';
  const title   = TITLE_LABELS[activeTitleId]     ?? '';
  const suitColor = SUIT_COLOR_MAP[activeSuitId]  ?? Colors.primary;

  const spinsColor = spinsRemaining <= 5 ? Colors.warning : Colors.accent;
  const showPilotRow = !compact && !!displayName;

  return (
    <View style={[styles.container, { backgroundColor: hud.backgroundColor, borderBottomColor: hud.borderColor }, style]}>
      {showPilotRow && (
        <View style={styles.pilotRow}>
          {emblem ? (
            <View style={[styles.emblemBadge, { borderColor: suitColor + 'AA', backgroundColor: suitColor + '1A' }]}>
              <Text style={[styles.emblemGlyph, { color: suitColor }]}>{emblem}</Text>
            </View>
          ) : null}
          <View style={styles.pilotTextCol}>
            {title ? <Text style={[styles.pilotTitle, { color: suitColor + 'CC' }]} numberOfLines={1}>{title}</Text> : null}
            <Text style={[styles.pilotName, { color: Colors.textPrimary }]} numberOfLines={1}>
              {displayName ?? '—'}
            </Text>
          </View>
          {level !== undefined ? (
            <View style={[styles.levelChip, { borderColor: suitColor + '88' }]}>
              <Text style={styles.levelChipLabel}>LVL</Text>
              <Text style={[styles.levelChipValue, { color: suitColor }]}>{level}</Text>
            </View>
          ) : null}
        </View>
      )}
      <View style={[styles.pillsRow, compact && styles.pillsRowCompact]}>
        <CreditPill credits={credits} />
        <ResourcePill label="✦ DUST" value={stardust}       color={Colors.warning} />
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
    paddingTop: 4,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  pilotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 4,
    gap: 10,
  },
  emblemBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemGlyph: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
  },
  pilotTextCol: {
    flex: 1,
    minWidth: 0,
  },
  pilotTitle: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2.5,
  },
  pilotName: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  levelChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
  },
  levelChipLabel: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1.5,
    color: Colors.textMuted,
  },
  levelChipValue: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    lineHeight: 18,
  },
  pillsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: Spacing.sm,
  },
  pillsRowCompact: {
    paddingVertical: 4,
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
