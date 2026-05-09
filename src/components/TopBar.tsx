import { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Typography, Spacing } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';
import { useGameStore } from '@/store/useGameStore';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
import {
  HUD_SKIN_TOKENS,
  EMBLEM_GLYPHS,
  TITLE_LABELS,
  SUIT_COLOR_MAP,
} from '@/services/CosmeticsService';

interface Props {
  right?: ReactNode;
}

export function TopBar({ right }: Props) {
  const displayName = useAuthStore((s) => s.displayName);
  const level = useGameStore((s) => s.level);

  const activeHudId    = useCosmeticsStore((s) => s.active['HUD_SKIN']   ?? 'hud_default');
  const activeEmblemId = useCosmeticsStore((s) => s.active['EMBLEM']     ?? 'emblem_none');
  const activeTitleId  = useCosmeticsStore((s) => s.active['TITLE']      ?? 'title_none');
  const activeSuitId   = useCosmeticsStore((s) => s.active['SUIT_COLOR'] ?? 'suit_default');

  const hud       = HUD_SKIN_TOKENS[activeHudId]    ?? HUD_SKIN_TOKENS.hud_default;
  const emblem    = EMBLEM_GLYPHS[activeEmblemId]   ?? '';
  const title     = TITLE_LABELS[activeTitleId]     ?? '';
  const suitColor = SUIT_COLOR_MAP[activeSuitId]    ?? Colors.primary;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: hud.backgroundColor,
          borderBottomColor: hud.borderColor,
        },
      ]}
    >
      <View style={styles.row}>
        <View
          style={[
            styles.emblem,
            { borderColor: suitColor + 'AA', backgroundColor: suitColor + '1A' },
          ]}
        >
          <Text style={[styles.emblemGlyph, { color: suitColor }]}>
            {emblem || '◇'}
          </Text>
        </View>

        <View style={styles.idCol}>
          {title ? (
            <Text style={[styles.tagLine, { color: suitColor + 'CC' }]} numberOfLines={1}>
              {title}
            </Text>
          ) : null}
          <Text style={styles.nameLine} numberOfLines={1}>
            {displayName ?? '—'}
          </Text>
        </View>

        <View style={[styles.levelChip, { borderColor: suitColor + '88' }]}>
          <Text style={styles.levelChipLabel}>LVL</Text>
          <Text style={[styles.levelChipValue, { color: suitColor }]}>{level}</Text>
        </View>

        {right ? <View style={styles.rightSlot}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Spacing.md,
    paddingTop: 6,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emblem: {
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
  idCol: {
    flex: 1,
    minWidth: 0,
  },
  tagLine: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2.5,
  },
  nameLine: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
    color: Colors.textPrimary,
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
  rightSlot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
