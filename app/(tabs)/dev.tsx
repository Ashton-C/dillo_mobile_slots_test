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
import {
  writePlayerIndex,
  getPlayerIndexEntry,
  deletePlayerIndex,
} from '@/services/FirestoreService';
import { DEBUG_PLAYERS } from '@/constants/debugPlayers';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

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
    async function checkPresence() {
      const results: Record<string, boolean> = {};
      await Promise.all(
        DEBUG_PLAYERS.map(async (p) => {
          const entry = await getPlayerIndexEntry(p.uid);
          results[p.uid] = entry !== null;
        }),
      );
      setPlayerPresence(results);
    }
    checkPresence();
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
      if (playerPresence[uid]) {
        await deletePlayerIndex(uid);
        setPlayerPresence((prev) => ({ ...prev, [uid]: false }));
      } else {
        const player = DEBUG_PLAYERS.find((p) => p.uid === uid)!;
        await writePlayerIndex(uid, {
          displayName: player.displayName,
          avatarColor: player.avatarColor,
          outpostLevel: player.outpostLevel,
          level: player.level,
        });
        setPlayerPresence((prev) => ({ ...prev, [uid]: true }));
      }
    } finally {
      setPlayerLoading((prev) => ({ ...prev, [uid]: false }));
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.screenTitle}>DEV</Text>

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
