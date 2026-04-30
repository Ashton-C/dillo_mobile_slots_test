import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { hapticCombatLaunch, hapticCombatWin, hapticCombatLoss } from '@/constants/haptics';
import { useAuthStore } from '@/store/useAuthStore';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { fetchRadarTargets, PlayerIndexEntry } from '@/services/FirestoreService';
import { DEBUG_PLAYERS, loadActiveDebugUids } from '@/constants/debugPlayers';
import { CombatMiniGame } from '@/components/CombatMiniGame';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

type CombatType = 'INTRUSION' | 'EXTRACTION';

export default function RadarScreen() {
  const user = useAuthStore((s) => s.user);
  const { intrusions, extractions, subtractResources } = useGameStore();
  const outpostLevel = useHabitatStore((s) => s.outpostLevel);

  const [targets, setTargets] = useState<PlayerIndexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<PlayerIndexEntry | null>(null);
  const [combatType, setCombatType] = useState<CombatType>('INTRUSION');
  const [miniGameVisible, setMiniGameVisible] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  async function scan() {
    if (!user) return;
    setLoading(true);
    try {
      const [found, activeDebugUids] = await Promise.all([
        fetchRadarTargets(user.uid, 5),
        loadActiveDebugUids(),
      ]);
      const debugEntries = DEBUG_PLAYERS.filter((p) => activeDebugUids.includes(p.uid));
      setTargets([...debugEntries, ...found]);
      setScanCount((n) => n + 1);
    } catch (e) {
      console.error('Radar scan failed:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    scan();
  }, []);

  function launchAttack(target: PlayerIndexEntry, type: CombatType) {
    if (type === 'INTRUSION' && intrusions <= 0) return;
    if (type === 'EXTRACTION' && extractions <= 0) return;

    const cost = type === 'INTRUSION' ? { intrusions: 1 } : { extractions: 1 };
    if (!subtractResources(cost)) return;

    setSelectedTarget(target);
    setCombatType(type);
    setMiniGameVisible(true);
    hapticCombatLaunch();
  }

  function handleMiniGameResult(won: boolean) {
    if (won) hapticCombatWin(); else hapticCombatLoss();
  }

  function handleMiniGameClose() {
    setMiniGameVisible(false);
    setSelectedTarget(null);
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <LinearGradient
        colors={[Colors.danger + '22', Colors.accent + '11', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGrad}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>RADAR</Text>
            <Text style={styles.subtitle}>Locate. Assess. Engage.</Text>
          </View>
          <Pressable onPress={scan} disabled={loading} style={styles.scanButton}>
            {loading
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Text style={styles.scanText}>SCAN</Text>}
          </Pressable>
        </View>

        {/* Resource pills */}
        <View style={styles.resourceRow}>
          <View style={[styles.pill, { borderColor: Colors.danger }]}>
            <Text style={[styles.pillLabel, { color: Colors.danger }]}>⚔ INTRUSION</Text>
            <Text style={[styles.pillValue, { color: Colors.danger }]}>{intrusions}</Text>
          </View>
          <View style={[styles.pill, { borderColor: Colors.accent }]}>
            <Text style={[styles.pillLabel, { color: Colors.accent }]}>⛏ EXTRACTION</Text>
            <Text style={[styles.pillValue, { color: Colors.accent }]}>{extractions}</Text>
          </View>
          <View style={[styles.pill, { borderColor: Colors.border }]}>
            <Text style={[styles.pillLabel, { color: Colors.textMuted }]}>OUTPOST</Text>
            <Text style={[styles.pillValue, { color: Colors.textSecondary }]}>LVL {outpostLevel}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.list}>
        {targets.length === 0 && !loading && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>NO SIGNALS DETECTED</Text>
            <Text style={styles.emptyHint}>Tap SCAN to sweep nearby space</Text>
          </View>
        )}

        {targets.map((target) => {
          const threatDiff = outpostLevel - target.outpostLevel;
          const threatColor = threatDiff >= 2 ? Colors.success : threatDiff >= 0 ? Colors.warning : Colors.danger;
          const threatLabel = threatDiff >= 2 ? 'WEAK' : threatDiff >= 0 ? 'EVEN' : 'STRONG';

          return (
            <View key={target.uid} style={styles.targetCard}>
              <LinearGradient
                colors={[Colors.danger + '11', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cardStripe}
              />

              <View style={styles.cardBody}>
                {/* Avatar */}
                <View style={[styles.avatarBadge, { backgroundColor: target.avatarColor + '22', borderColor: target.avatarColor }]}>
                  <Text style={[styles.avatarText, { color: target.avatarColor }]}>
                    {target.displayName.slice(0, 2).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.cardInfo}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.targetName}>{target.displayName}</Text>
                    <View style={[styles.threatBadge, { borderColor: threatColor }]}>
                      <Text style={[styles.threatText, { color: threatColor }]}>{threatLabel}</Text>
                    </View>
                  </View>
                  <Text style={styles.targetMeta}>
                    OUTPOST LVL {target.outpostLevel}  ·  PILOT LVL {target.level}
                  </Text>
                </View>
              </View>

              <View style={styles.cardActions}>
                <Pressable
                  onPress={() => launchAttack(target, 'INTRUSION')}
                  disabled={intrusions <= 0}
                  style={[
                    styles.actionButton,
                    intrusions <= 0 ? styles.actionDisabled : { backgroundColor: Colors.danger + '22', borderColor: Colors.danger },
                  ]}
                >
                  <Text style={[styles.actionText, { color: intrusions <= 0 ? Colors.textMuted : Colors.danger }]}>
                    ⚔  BREACH
                  </Text>
                  <Text style={[styles.actionCost, { color: intrusions <= 0 ? Colors.textMuted : Colors.danger }]}>
                    1 INTRUSION
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => launchAttack(target, 'EXTRACTION')}
                  disabled={extractions <= 0}
                  style={[
                    styles.actionButton,
                    extractions <= 0 ? styles.actionDisabled : { backgroundColor: Colors.accent + '22', borderColor: Colors.accent },
                  ]}
                >
                  <Text style={[styles.actionText, { color: extractions <= 0 ? Colors.textMuted : Colors.accent }]}>
                    ⛏  EXTRACT
                  </Text>
                  <Text style={[styles.actionCost, { color: extractions <= 0 ? Colors.textMuted : Colors.accent }]}>
                    1 EXTRACTION
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })}

        {targets.length > 0 && (
          <Pressable onPress={scan} disabled={loading} style={styles.rescanRow}>
            <Text style={styles.rescanText}>↻  RESCAN SECTOR</Text>
          </Pressable>
        )}

        <Text style={styles.footnote}>
          Combat power = reel locks + OUTPOST LVL bonus. Win to siphon credits. Defender's VAULT and TURRET passively resist.
        </Text>
      </ScrollView>

      <CombatMiniGame
        visible={miniGameVisible}
        target={selectedTarget}
        combatType={combatType}
        onClose={handleMiniGameClose}
        onResult={handleMiniGameResult}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  headerGrad: {
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
  scanButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.primary,
    minWidth: 72,
    alignItems: 'center',
    marginTop: 4,
  },
  scanText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
    letterSpacing: 3,
  },
  resourceRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  pillLabel: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  pillValue: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
  },
  list: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: Typography.sizes.md,
    color: Colors.textMuted,
    letterSpacing: 3,
  },
  emptyHint: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  targetCard: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardStripe: {
    height: 3,
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  avatarBadge: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
  },
  cardInfo: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  targetName: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  threatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  threatText: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  targetMeta: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  cardActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  actionButton: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    alignItems: 'center',
    gap: 2,
  },
  actionDisabled: {
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  actionText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  actionCost: {
    fontSize: 10,
    letterSpacing: 1,
  },
  rescanRow: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  rescanText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  footnote: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    lineHeight: 18,
    marginTop: Spacing.xs,
  },
});
