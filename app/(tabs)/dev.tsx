import React, { useEffect, useRef, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useAnomalyStore } from '@/store/useAnomalyStore';
import { useDroneStore } from '@/store/useDroneStore';
import { useGameStore } from '@/store/useGameStore';
import { slotsEngine, TemporalRiftTier } from '@/services/SlotsEngine';
import type { SpinResult } from '@/services/SlotsEngine';
import { ANOMALIES } from '@/services/AnomalyService';
import type { AnomalyId } from '@/services/AnomalyService';
import type { DroneType } from '@/models/Drone';
import { DEBUG_PLAYERS, loadActiveDebugUids, saveActiveDebugUids } from '@/constants/debugPlayers';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

interface BuildInfo {
  sha: string;
  shortSha: string;
  branch: string;
  commitDate: string;
  commitMessage: string;
  dirty: boolean;
  configEvaluatedAt: string;
}

function fmtRelative(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 60)        return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60)        return `${min}m ago`;
  const hr  = Math.floor(min / 60);
  if (hr  < 24)        return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function BuildInfoCard() {
  const info = (Constants.expoConfig?.extra?.buildInfo as BuildInfo | undefined) ?? null;
  if (!info) {
    return (
      <View style={[devStyles.card, devStyles.cardWarn]}>
        <Text style={devStyles.cardTitle}>BUILD INFO</Text>
        <Text style={devStyles.cardLine}>No build info — app.config.js may not be capturing git data.</Text>
      </View>
    );
  }
  return (
    <View style={[devStyles.card, info.dirty ? devStyles.cardWarn : devStyles.cardOk]}>
      <Text style={devStyles.cardTitle}>BUILD INFO</Text>
      <View style={devStyles.cardRow}>
        <Text style={devStyles.cardKey}>BRANCH</Text>
        <Text style={devStyles.cardVal} numberOfLines={1}>{info.branch}{info.dirty ? '*' : ''}</Text>
      </View>
      <View style={devStyles.cardRow}>
        <Text style={devStyles.cardKey}>COMMIT</Text>
        <Text style={devStyles.cardVal} numberOfLines={1}>{info.shortSha}</Text>
      </View>
      <View style={devStyles.cardRow}>
        <Text style={devStyles.cardKey}>SUBJECT</Text>
        <Text style={devStyles.cardVal} numberOfLines={2}>{info.commitMessage}</Text>
      </View>
      <View style={devStyles.cardRow}>
        <Text style={devStyles.cardKey}>COMMITTED</Text>
        <Text style={devStyles.cardVal} numberOfLines={1}>{fmtRelative(info.commitDate)}</Text>
      </View>
      <View style={devStyles.cardRow}>
        <Text style={devStyles.cardKey}>BUNDLE</Text>
        <Text style={devStyles.cardVal} numberOfLines={1}>started {fmtRelative(info.configEvaluatedAt)}</Text>
      </View>
      {info.dirty && (
        <Text style={devStyles.cardWarnText}>⚠ Working tree dirty — uncommitted changes are running.</Text>
      )}
    </View>
  );
}

const devStyles = StyleSheet.create({
  card: {
    padding: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
    gap: 4,
  },
  cardOk:   { borderColor: Colors.success + '88' },
  cardWarn: { borderColor: Colors.warning + 'AA' },
  cardTitle: {
    fontSize: Typography.sizes.xs,
    color: Colors.accent,
    letterSpacing: 3,
    fontWeight: Typography.weights.bold,
    marginBottom: Spacing.xs,
  },
  cardRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  cardKey: { width: 84, fontSize: 10, color: Colors.textMuted, letterSpacing: 1.5, fontWeight: Typography.weights.bold },
  cardVal: { flex: 1, fontSize: Typography.sizes.xs, color: Colors.text, fontFamily: Typography.fontFamily, fontWeight: Typography.weights.bold },
  cardWarnText: { marginTop: Spacing.xs, fontSize: 10, color: Colors.warning, fontStyle: 'italic' },
});

const ANOMALY_IDS: AnomalyId[] = [
  'SOLAR_SURGE', 'VOID_STORM', 'CREDIT_BLOOM', 'SHIELD_PULSE', 'RAID_SHADOW', 'CALM',
];
const DRONE_TYPES: DroneType[] = ['SENTINEL', 'SCRAMBLER', 'HARVESTER', 'RAIDER'];
const RIFT_TIERS: TemporalRiftTier[] = [0, 1, 2, 3];

const OVERRIDES: { label: string; partial: Partial<SpinResult> }[] = [
  { label: 'JACKPOT', partial: { creditsWon: 2000, isJackpot: true, outcomeType: 'CREDITS' } },
  { label: 'TRIPLE ◈', partial: { extractionsWon: 2, outcomeType: 'EXTRACTION', isJackpot: false } },
  { label: 'PAIR ⚡', partial: { attacksWon: 1, outcomeType: 'ATTACK', isJackpot: false } },
  { label: 'NOTHING', partial: { creditsWon: 0, outcomeType: 'NOTHING', isJackpot: false } },
];

export default function DevScreen() {
  const anomalyStore = useAnomalyStore();
  const { debugDeployDrone, clearAll: clearDrones } = useDroneStore();
  const { debugSetResources, setRiftTier, riftTier } = useGameStore();
  const isSpinning = useGameStore((s) => s.isSpinning);

  const [overrideLabel, setOverrideLabel] = useState<string | null>(null);
  const [playerPresence, setPlayerPresence] = useState<Record<string, boolean>>({});
  const [playerLoading, setPlayerLoading] = useState<Record<string, boolean>>({});
  const prevSpinningRef = useRef(false);

  useEffect(() => {
    loadActiveDebugUids().then((uids) => {
      const results: Record<string, boolean> = {};
      DEBUG_PLAYERS.forEach((p) => { results[p.uid] = uids.includes(p.uid); });
      setPlayerPresence(results);
    });
  }, []);

  useEffect(() => {
    if (prevSpinningRef.current && !isSpinning && !slotsEngine.hasForcedOutcome()) {
      setOverrideLabel(null);
    }
    prevSpinningRef.current = isSpinning;
  }, [isSpinning]);

  async function togglePlayer(uid: string) {
    setPlayerLoading((prev) => ({ ...prev, [uid]: true }));
    try {
      const current = await loadActiveDebugUids();
      const next = playerPresence[uid]
        ? current.filter((u) => u !== uid)
        : [...current, uid];
      await saveActiveDebugUids(next);
      setPlayerPresence((prev) => ({ ...prev, [uid]: !prev[uid] }));
    } finally {
      setPlayerLoading((prev) => ({ ...prev, [uid]: false }));
    }
  }

  const router = useRouter();
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.screenTitle}>DEV</Text>
        <Pressable
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/pilot')}
          style={{ paddingVertical: 4, paddingHorizontal: Spacing.sm }}
        >
          <Text style={{ color: Colors.textMuted, letterSpacing: 2, fontWeight: Typography.weights.bold, fontSize: Typography.sizes.xs }}>
            BACK
          </Text>
        </Pressable>
      </View>

      <BuildInfoCard />

      <Text style={styles.sectionTitle}>MODIFIERS</Text>

      <Text style={styles.subLabel}>ANOMALY</Text>
      <View style={styles.buttonGrid}>
        {ANOMALY_IDS.map((id) => {
          const def = ANOMALIES[id];
          const active = anomalyStore.activeAnomaly?.id === id;
          return (
            <Pressable
              key={id}
              style={[
                styles.chip,
                active && { borderColor: def.color, backgroundColor: def.color + '22' },
              ]}
              onPress={() => anomalyStore.debugForceAnomaly(id)}
            >
              <Text style={[styles.chipText, active && { color: def.color }]}>{def.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.subLabel}>RIFT TIER</Text>
      <View style={styles.buttonRow}>
        {RIFT_TIERS.map((tier) => (
          <Pressable
            key={tier}
            style={[styles.chip, riftTier === tier && styles.chipActive]}
            onPress={() => setRiftTier(tier)}
          >
            <Text style={[styles.chipText, riftTier === tier && styles.chipTextActive]}>
              TIER {tier}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.subLabel}>DRONES</Text>
      <View style={styles.buttonGrid}>
        {DRONE_TYPES.map((type) => (
          <Pressable
            key={type}
            style={styles.chip}
            onPress={() => debugDeployDrone(type)}
          >
            <Text style={styles.chipText}>{type}</Text>
          </Pressable>
        ))}
        <Pressable style={[styles.chip, styles.chipDanger]} onPress={clearDrones}>
          <Text style={[styles.chipText, styles.chipTextDanger]}>CLEAR ALL</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>RESOURCES</Text>
      <View style={styles.buttonGrid}>
        <Pressable style={styles.chip} onPress={() => debugSetResources({ credits: 1000 })}>
          <Text style={styles.chipText}>+1000 CR</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={() => debugSetResources({ attacks: 5 })}>
          <Text style={styles.chipText}>+5 FUEL</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={() => debugSetResources({ raids: 5 })}>
          <Text style={styles.chipText}>+5 BOOST</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={() => debugSetResources({ shields: 5 })}>
          <Text style={styles.chipText}>+5 SHIELD</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={() => debugSetResources({ spinsRemaining: 10 })}>
          <Text style={styles.chipText}>+10 SPINS</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={() => debugSetResources({ intrusions: 5 })}>
          <Text style={styles.chipText}>+5 BREACH</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={() => debugSetResources({ extractions: 5 })}>
          <Text style={styles.chipText}>+5 BEAM</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle}>SPIN OVERRIDE</Text>
      {overrideLabel !== null && (
        <View style={styles.overrideBadge}>
          <Text style={styles.overrideBadgeText}>OVERRIDE SET — {overrideLabel}</Text>
        </View>
      )}
      <View style={styles.buttonGrid}>
        {OVERRIDES.map(({ label, partial }) => (
          <Pressable
            key={label}
            style={[styles.chip, overrideLabel === label && styles.chipActive]}
            onPress={() => {
              slotsEngine.setForcedOutcome(partial);
              setOverrideLabel(label);
            }}
          >
            <Text style={[styles.chipText, overrideLabel === label && styles.chipTextActive]}>
              {label}
            </Text>
          </Pressable>
        ))}
        {overrideLabel !== null && (
          <Pressable
            style={[styles.chip, styles.chipDanger]}
            onPress={() => {
              slotsEngine.setForcedOutcome(null);
              setOverrideLabel(null);
            }}
          >
            <Text style={[styles.chipText, styles.chipTextDanger]}>CANCEL</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.sectionTitle}>TEST PLAYERS</Text>
      {DEBUG_PLAYERS.map((player) => {
        const present = playerPresence[player.uid] ?? false;
        const loading = playerLoading[player.uid] ?? false;
        return (
          <View key={player.uid} style={styles.playerRow}>
            <View
              style={[
                styles.presenceDot,
                { backgroundColor: present ? Colors.success : Colors.textMuted },
              ]}
            />
            <View style={styles.playerInfo}>
              <Text style={styles.playerName}>{player.displayName}</Text>
              <Text style={styles.playerMeta}>
                LVL {player.level}  ·  OUTPOST {player.outpostLevel}
              </Text>
            </View>
            <Pressable
              style={[styles.chip, styles.chipSmall, present && styles.chipDanger]}
              onPress={() => togglePlayer(player.uid)}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color={Colors.textSecondary} />
              ) : (
                <Text style={[styles.chipText, present && styles.chipTextDanger]}>
                  {present ? 'REMOVE' : 'ADD'}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  screenTitle: {
    fontSize: Typography.sizes.xxl,
    fontWeight: Typography.weights.bold,
    color: Colors.accent,
    letterSpacing: 4,
    marginBottom: Spacing.lg,
    marginTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textSecondary,
    letterSpacing: 3,
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingBottom: Spacing.xs,
  },
  subLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    backgroundColor: Colors.surface,
  },
  chipSmall: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    minWidth: 70,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '22',
  },
  chipDanger: {
    borderColor: Colors.danger,
    backgroundColor: Colors.danger + '11',
  },
  chipText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  chipTextActive: {
    color: Colors.primary,
  },
  chipTextDanger: {
    color: Colors.danger,
  },
  overrideBadge: {
    backgroundColor: Colors.accent + '22',
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    marginBottom: Spacing.sm,
    alignSelf: 'flex-start',
  },
  overrideBadgeText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.accent,
    letterSpacing: 2,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  playerMeta: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
});
