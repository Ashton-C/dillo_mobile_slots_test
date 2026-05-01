import { Modal, View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SlotSymbol, TemporalRiftTier, RIFT_COSTS } from '@/services/SlotsEngine';
import { SYMBOL_PACK_GLYPHS } from '@/services/CosmeticsService';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
import { useHabitatStore, getNumActiveLines } from '@/store/useHabitatStore';
import {
  computeSymbolWeights,
  computeHitRates,
  computeExpectedCredits,
  computeBreakEven,
} from '@/utils/oddsCalculator';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const ALL_SYMBOLS: SlotSymbol[] = [
  'CREDIT_LARGE', 'CREDIT_MEDIUM', 'CREDIT_SMALL',
  'ATTACK', 'RAID', 'SHIELD', 'INTRUSION', 'EXTRACTION', 'EMPTY',
];

const SYMBOL_LABELS: Record<SlotSymbol, string> = {
  CREDIT_LARGE:  'CR LARGE',
  CREDIT_MEDIUM: 'CR MED',
  CREDIT_SMALL:  'CR SMALL',
  ATTACK:        'ATTACK',
  RAID:          'RAID',
  SHIELD:        'SHIELD',
  INTRUSION:     'INTRUSION',
  EXTRACTION:    'EXTRACTION',
  EMPTY:         'EMPTY',
};

const SYMBOL_COLORS: Record<SlotSymbol, string> = {
  CREDIT_SMALL:  Colors.credits,
  CREDIT_MEDIUM: Colors.credits,
  CREDIT_LARGE:  Colors.credits,
  ATTACK:        Colors.attack,
  RAID:          Colors.raid,
  SHIELD:        Colors.shield,
  INTRUSION:     Colors.danger,
  EXTRACTION:    Colors.accent,
  EMPTY:         Colors.textMuted,
};

function fmt(n: number, decimals = 2): string {
  return n.toFixed(decimals);
}

interface Props {
  visible: boolean;
  onClose: () => void;
  riftTier: TemporalRiftTier;
  signalBoost: boolean;
  creditMultiplier: number;
  overclockBonus: number;
}

export function OddsModal({ visible, onClose, riftTier, signalBoost, creditMultiplier, overclockBonus }: Props) {
  const activeSymbolId = useCosmeticsStore((s) => s.active['SYMBOL_PACK'] ?? 'sym_default');
  const glyphs = SYMBOL_PACK_GLYPHS[activeSymbolId] ?? SYMBOL_PACK_GLYPHS.sym_default;
  const outpostLevel = useHabitatStore((s) => s.outpostLevel);
  const numLines = getNumActiveLines(outpostLevel) as 1 | 3 | 5;

  const weights = computeSymbolWeights(riftTier, signalBoost);
  const hitRates = computeHitRates(weights);
  const totalWeight = Object.values(weights).reduce((s, v) => s + v, 0);

  const TIERS: TemporalRiftTier[] = [0, 1, 2, 3];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>SLOT ODDS</Text>
            <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

            {/* Section 1 — Symbol Odds */}
            <Text style={styles.sectionLabel}>SYMBOL PROBABILITIES</Text>
            <Text style={styles.sectionSub}>Rift T{riftTier}{signalBoost ? '  +SIGNAL BOOST' : ''}</Text>

            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 2.2 }]}>SYMBOL</Text>
              <Text style={[styles.th, styles.thRight]}>DRAW</Text>
              <Text style={[styles.th, styles.thRight]}>PAIR</Text>
              <Text style={[styles.th, styles.thRight]}>TRIPLE</Text>
            </View>

            {ALL_SYMBOLS.map((sym) => {
              const rates = hitRates[sym];
              const color = SYMBOL_COLORS[sym];
              return (
                <View key={sym} style={styles.tableRow}>
                  <View style={[styles.td, { flex: 2.2, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                    <Text style={[styles.glyph, { color }]}>{glyphs[sym]}</Text>
                    <Text style={[styles.tdText, { color }]}>{SYMBOL_LABELS[sym]}</Text>
                  </View>
                  <Text style={[styles.td, styles.tdRight]}>{fmt(rates.singlePct, 1)}%</Text>
                  <Text style={[styles.td, styles.tdRight]}>{fmt(rates.pairPct, 2)}%</Text>
                  <Text style={[styles.td, styles.tdRight, sym.startsWith('CREDIT') && { color: Colors.credits }]}>
                    {fmt(rates.triplePct, 3)}%
                  </Text>
                </View>
              );
            })}

            <Text style={styles.note}>Weight total: {totalWeight}</Text>

            {/* Section 2 — Expected Value */}
            <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>EXPECTED VALUE / SPIN</Text>
            <Text style={styles.sectionSub}>Lines: {numLines}  ·  Current multiplier: {creditMultiplier.toFixed(2)}×{overclockBonus > 0 ? ` +${overclockBonus} CR flat` : ''}</Text>

            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 1.2 }]}>RIFT</Text>
              <Text style={[styles.th, styles.thRight]}>BASE EV</Text>
              <Text style={[styles.th, styles.thRight]}>COST</Text>
              <Text style={[styles.th, styles.thRight]}>NET</Text>
              <Text style={[styles.th, styles.thRight]}>B/E ×</Text>
            </View>

            {TIERS.map((tier) => {
              const baseEv = computeExpectedCredits(tier, signalBoost, numLines);
              const cost = RIFT_COSTS[tier];
              const effectiveEv = baseEv * creditMultiplier + overclockBonus;
              const net = effectiveEv - cost;
              const beRaw = computeBreakEven(tier, numLines);
              const isPositive = net >= 0;

              return (
                <View key={tier} style={[styles.tableRow, tier === riftTier && styles.activeRow]}>
                  <Text style={[styles.td, { flex: 1.2 }, tier === riftTier && styles.activeTd]}>T{tier}</Text>
                  <Text style={[styles.td, styles.tdRight]}>{Math.round(baseEv)} CR</Text>
                  <Text style={[styles.td, styles.tdRight]}>{cost > 0 ? `-${cost}` : '0'} CR</Text>
                  <Text style={[styles.td, styles.tdRight, { color: isPositive ? Colors.success : Colors.danger }]}>
                    {isPositive ? '+' : ''}{Math.round(net)} CR
                  </Text>
                  <Text style={[styles.td, styles.tdRight, { color: isPositive ? Colors.success : Colors.textMuted }]}>
                    {beRaw === 0 ? '—' : beRaw === Infinity ? '∞' : `${beRaw.toFixed(2)}×`}
                  </Text>
                </View>
              );
            })}

            <Text style={styles.note}>
              NET uses your active multiplier ({creditMultiplier.toFixed(2)}×). B/E × = minimum multiplier for profit.
            </Text>

            {/* Section 3 — Modifier Guide */}
            <Text style={[styles.sectionLabel, { marginTop: Spacing.lg }]}>MODIFIER GUIDE</Text>

            <ModRow label="SIGNAL BOOST" value="×1.5 draw weight on all credit symbols (~+20% EV)" color={Colors.accent} />
            <ModRow label="HARVESTER" value="+75% credit multiplier × 8 spins" color={Colors.success} />
            <ModRow label="SOLAR SURGE (anomaly)" value="+100% credit multiplier" color={Colors.credits} />
            <ModRow
              label="OVERCLOCK"
              value={`+${overclockBonus} CR flat bonus on next spin (GENERATOR level)`}
              color={Colors.credits}
            />
            <ModRow label="RIFT T1" value="+5 CR·SM  +3 CR·MED  −4 EMPTY  −2 ATK  −2 RAID" color={Colors.textSecondary} />
            <ModRow label="RIFT T2" value="+8 CR·MED  +5 CR·LG  −5 EMPTY  −3 CR·SM" color={Colors.textSecondary} />
            <ModRow label="RIFT T3" value="+12 CR·LG  +6 CR·MED  +3 RAID  +2 ATK  −10 CR·SM  −8 EMPTY" color={Colors.textSecondary} />

            <View style={{ height: Spacing.xl }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ModRow({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.modRow}>
      <Text style={[styles.modLabel, { color }]}>{label}</Text>
      <Text style={styles.modValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    maxHeight: '88%',
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  title: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 3,
  },
  closeBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
    fontWeight: Typography.weights.bold,
  },
  scroll: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  sectionLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
    letterSpacing: 2,
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: Colors.border,
    paddingBottom: 4,
    marginBottom: 2,
  },
  th: {
    flex: 1,
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  thRight: {
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border + '44',
  },
  activeRow: {
    backgroundColor: Colors.primary + '18',
    borderRadius: 4,
  },
  td: {
    flex: 1,
    fontSize: Typography.sizes.xs,
    color: Colors.textSecondary,
  },
  tdText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.medium,
  },
  tdRight: {
    textAlign: 'right',
  },
  activeTd: {
    color: Colors.primary,
    fontWeight: Typography.weights.bold,
  },
  glyph: {
    fontSize: 13,
    lineHeight: 17,
  },
  note: {
    fontSize: 9,
    color: Colors.textMuted,
    marginTop: 6,
    marginBottom: 4,
    lineHeight: 14,
  },
  modRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border + '44',
    gap: 2,
  },
  modLabel: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  modValue: {
    fontSize: 10,
    color: Colors.textSecondary,
    lineHeight: 15,
  },
});
