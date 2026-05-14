import { View, Text, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticBuildStart } from '@/constants/haptics';
import { LegendCard, LegendSection, LegendRow, LegendNote } from '@/components/LegendCard';
import { IconButton } from '@/components/IconButton';
import { TopBar } from '@/components/TopBar';
import { useEffect, useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore, getGridConfig } from '@/store/useHabitatStore';
import { BuildingDetailModal } from '@/components/BuildingDetailModal';
import { OutpostDetailModal } from '@/components/OutpostDetailModal';
import { OutpostMapInteractive } from '@/components/OutpostMap';
import { BuildingType, outpostUpgradeCost, outpostUpgradeDuration } from '@/models/Habitat';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

function formatTimer(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

export default function HabitatScreen() {
  const { credits } = useGameStore();
  const { buildingLevels, outpostLevel, activeBuildJob, msUntilComplete } = useHabitatStore();

  const [selectedBuilding, setSelectedBuilding] = useState<BuildingType | null>(null);
  const [outpostModalVisible, setOutpostModalVisible] = useState(false);
  const [legendVisible, setLegendVisible] = useState(false);

  const builderBusy = activeBuildJob !== null;
  const isUpgradingOutpost = activeBuildJob?.isOutpost === true;
  const outpostMaxed = outpostLevel >= 10;

  const gridCfg = getGridConfig(outpostLevel);
  const numPaylines = gridCfg.numLines;
  const paylinesNextHint = numPaylines < 3  ? '+2 AT LV 3'
                         : numPaylines < 5  ? '+2 AT LV 6'
                         : numPaylines < 10 ? '5×5 + 10 LINES AT LV 10'
                         : 'MAX';

  return (
    <SafeAreaView style={styles.root}>

      <TopBar
        right={<IconButton glyph="?" onPress={() => setLegendVisible(true)} />}
      />

      {/* Outpost banner */}
      <LinearGradient
        colors={[Colors.gradientEnd + '44', Colors.gradientStart + '22', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.outpostBanner}
      >
        <View style={styles.outpostLeft}>
          <Text style={styles.outpostTitle}>HOMESTEAD</Text>
          <View style={styles.outpostLevelRow}>
            <Text style={styles.outpostLevelNum}>{outpostLevel}</Text>
            <Text style={styles.outpostLevelMax}> / 10</Text>
          </View>
          <Text style={styles.outpostHint}>
            {outpostMaxed ? 'Fully upgraded' : `Buildings capped at homestead level ${outpostLevel}`}
          </Text>
          {/* 2a: Payline unlock hint */}
          <Text style={[styles.paylinesHint, { color: numPaylines >= 5 ? Colors.textMuted : Colors.accent + '99' }]}>
            PAYLINES  {numPaylines} ACTIVE  ·  {paylinesNextHint}
          </Text>
        </View>

        <View style={styles.outpostRight}>
          {!outpostMaxed && (
            isUpgradingOutpost ? (
              <View style={styles.outpostBuildingBadge}>
                <Text style={styles.outpostBuildingText}>
                  UPGRADING  {formatTimer(msUntilComplete)}
                </Text>
              </View>
            ) : (
              <Pressable
                onPress={() => setOutpostModalVisible(true)}
                style={styles.outpostButton}
              >
                <Text style={styles.outpostButtonLabel}>UPGRADE</Text>
                <Text style={styles.outpostButtonSub}>LV {outpostLevel + 1}</Text>
              </Pressable>
            )
          )}
        </View>
      </LinearGradient>

      {/* Status row */}
      <View style={styles.statusRow}>
        <View style={styles.creditsBadge}>
          <Text style={styles.creditsValue}>{credits.toLocaleString()}</Text>
          <Text style={styles.creditsLabel}> CR</Text>
        </View>
        {builderBusy && !isUpgradingOutpost && (
          <View style={styles.builderBadge}>
            <Text style={styles.builderText}>BUILDING · {formatTimer(msUntilComplete)}</Text>
          </View>
        )}
        {!builderBusy && (
          <View style={[styles.builderBadge, styles.builderBadgeIdle]}>
            <Text style={styles.builderTextIdle}>◎ BUILDER READY</Text>
          </View>
        )}
      </View>

      {/* Full-screen iso map */}
      <OutpostMapInteractive
        onTapBuilding={(type) => setSelectedBuilding(type)}
        onTapOutpost={() => setOutpostModalVisible(true)}
      />

      {/* Modals */}
      <BuildingDetailModal
        type={selectedBuilding}
        onClose={() => setSelectedBuilding(null)}
      />
      <OutpostDetailModal
        visible={outpostModalVisible}
        onClose={() => setOutpostModalVisible(false)}
      />

      <LegendCard visible={legendVisible} onDismiss={() => setLegendVisible(false)} title="BASE LEGEND" accentColor={Colors.credits}>
        <LegendSection label="BUILDINGS" />
        <LegendRow left="GENERATOR" right="Passive +level×20 CR / 30s" color={Colors.credits} />
        <LegendRow left="ARMORY" right="Raises Fuel Cell cap" color={Colors.attack} />
        <LegendRow left="BARRACKS" right="Raises max spin storage (+5, then +6, +7…)" color={Colors.success} />
        <LegendRow left="VAULT" right="Absorbs level×5% raid loss" color={Colors.shield} />
        <LegendRow left="TURRET" right="Auto-blocks N attacks/day" color={Colors.accent} />
        <LegendRow left="HANGAR" right="Unlocks crew contract slots" color={Colors.primary} />
        <LegendSection label="MAP" />
        <LegendRow left="Tap any node" right="View + upgrade building" />
        <LegendRow left="Pulsing ring" right="Active construction" />
        <LegendRow left="▲ on node" right="Gated by Homestead level" />
        <LegendSection label="RULES" />
        <LegendRow left="Homestead Level gates all buildings" />
        <LegendRow left="One active build job at a time" />
        <LegendNote text="Build timers count down while the app is closed. Higher tiers take significantly longer." />
      </LegendCard>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  outpostBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  outpostLeft: { gap: 2 },
  outpostTitle: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 4 },
  outpostLevelRow: { flexDirection: 'row', alignItems: 'baseline' },
  outpostLevelNum: { fontSize: Typography.sizes.xxl, fontWeight: Typography.weights.bold, color: Colors.accent },
  outpostLevelMax: { fontSize: Typography.sizes.md, color: Colors.textMuted, letterSpacing: 1 },
  outpostHint: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 1 },
  paylinesHint: { fontSize: 10, letterSpacing: 1 },
  outpostRight: { alignItems: 'flex-end' },
  outpostButton: {
    backgroundColor: Colors.accent,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    minWidth: 80,
  },
  outpostButtonLabel: { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, color: Colors.background, letterSpacing: 2 },
  outpostButtonSub: { fontSize: 10, color: Colors.background + 'AA', letterSpacing: 1 },
  outpostBuildingBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.accent },
  outpostBuildingText: { fontSize: Typography.sizes.xs, color: Colors.accent, fontWeight: Typography.weights.bold, letterSpacing: 1 },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  creditsBadge: { flexDirection: 'row', alignItems: 'baseline' },
  creditsValue: { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: Colors.credits },
  creditsLabel: { fontSize: Typography.sizes.sm, color: Colors.textMuted, letterSpacing: 2 },
  builderBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.accent, backgroundColor: Colors.surfaceElevated },
  builderBadgeIdle: { borderColor: Colors.border },
  builderText: { fontSize: Typography.sizes.xs, color: Colors.accent, fontWeight: Typography.weights.bold, letterSpacing: 1 },
  builderTextIdle: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 1 },
});
