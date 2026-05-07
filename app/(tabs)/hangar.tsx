import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hapticCombatLaunch, hapticCombatWin, hapticCombatLoss } from '@/constants/haptics';
import { soundService } from '@/services/SoundService';
import { LegendCard, LegendSection, LegendRow, LegendNote } from '@/components/LegendCard';
import { IconButton } from '@/components/IconButton';
import { TopBar } from '@/components/TopBar';
import { useAuthStore } from '@/store/useAuthStore';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { fetchRadarTargets, PlayerIndexEntry } from '@/services/FirestoreService';
import { DEBUG_PLAYERS, loadActiveDebugUids } from '@/constants/debugPlayers';
import { RouletteGame } from '@/components/RouletteGame';
import { SectorMap } from '@/components/SectorMap';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

const RECENT_TARGETS_KEY = 'recentRadarTargets';
type StoredTarget = Pick<PlayerIndexEntry, 'uid' | 'displayName' | 'avatarColor' | 'outpostLevel' | 'level'>;

async function loadRecentTargets(): Promise<PlayerIndexEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_TARGETS_KEY);
    if (!raw) return [];
    const stored = JSON.parse(raw) as StoredTarget[];
    return stored.map((t) => ({ ...t, updatedAt: null }));
  } catch { return []; }
}

async function saveRecentTargets(fresh: PlayerIndexEntry[]): Promise<void> {
  try {
    const stored: StoredTarget[] = fresh.slice(0, 3).map(({ uid, displayName, avatarColor, outpostLevel, level }) => ({
      uid, displayName, avatarColor, outpostLevel, level,
    }));
    await AsyncStorage.setItem(RECENT_TARGETS_KEY, JSON.stringify(stored));
  } catch { /* non-critical */ }
}

type CombatType = 'INTRUSION' | 'EXTRACTION';

interface TargetCardProps {
  target: PlayerIndexEntry;
  outpostLevel: number;
  intrusions: number;
  extractions: number;
  onAttack: (target: PlayerIndexEntry, type: CombatType) => void;
  dimmed?: boolean;
}

function TargetCard({ target, outpostLevel, intrusions, extractions, onAttack, dimmed }: TargetCardProps) {
  const threatDiff = outpostLevel - target.outpostLevel;
  const threatColor = threatDiff >= 2 ? Colors.success : threatDiff >= 0 ? Colors.warning : Colors.danger;
  const threatLabel = threatDiff >= 2 ? 'WEAK' : threatDiff >= 0 ? 'EVEN' : 'STRONG';

  // Defender power range (server roll: outpostLevel×10 + rand(0–49))
  const themMin = target.outpostLevel * 10;
  const themMax = target.outpostLevel * 10 + 49;

  return (
    <View style={[styles.targetCard, dimmed && styles.targetCardDimmed]}>
      <LinearGradient
        colors={[Colors.danger + '11', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.cardStripe}
      />
      <View style={styles.cardBody}>
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
            {dimmed && <Text style={styles.recentBadge}>RECENT</Text>}
          </View>
          <Text style={styles.targetMeta}>
            HOMESTEAD LVL {target.outpostLevel}  ·  PILOT LVL {target.level}
          </Text>
          <Text style={styles.powerPreview}>
            <Text style={{ color: Colors.primary }}>EVEN 75  </Text>
            <Text style={{ color: Colors.accent }}>SECTOR 110  </Text>
            <Text style={{ color: Colors.credits }}>JACKPOT 145</Text>
          </Text>
          <Text style={styles.powerPreview}>
            <Text style={{ color: Colors.textMuted }}>DEFENDER  {themMin}–{themMax}</Text>
          </Text>
        </View>
      </View>
      <View style={styles.cardActions}>
        <Pressable
          onPress={() => onAttack(target, 'INTRUSION')}
          disabled={intrusions <= 0}
          style={[
            styles.actionButton,
            intrusions <= 0 ? styles.actionDisabled : { backgroundColor: Colors.danger + '22', borderColor: Colors.danger },
          ]}
        >
          <Text style={[styles.actionText, { color: intrusions <= 0 ? Colors.textMuted : Colors.danger }]}>⚔  BREACH</Text>
          <Text style={[styles.actionCost,  { color: intrusions <= 0 ? Colors.textMuted : Colors.danger }]}>1 INTRUSION</Text>
        </Pressable>
        <Pressable
          onPress={() => onAttack(target, 'EXTRACTION')}
          disabled={extractions <= 0}
          style={[
            styles.actionButton,
            extractions <= 0 ? styles.actionDisabled : { backgroundColor: Colors.accent + '22', borderColor: Colors.accent },
          ]}
        >
          <Text style={[styles.actionText, { color: extractions <= 0 ? Colors.textMuted : Colors.accent }]}>⛏  EXTRACT</Text>
          <Text style={[styles.actionCost,  { color: extractions <= 0 ? Colors.textMuted : Colors.accent }]}>1 EXTRACTION</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function RadarScreen() {
  const user = useAuthStore((s) => s.user);
  const { intrusions, extractions, subtractResources } = useGameStore();
  const outpostLevel = useHabitatStore((s) => s.outpostLevel);

  const [targets, setTargets] = useState<PlayerIndexEntry[]>([]);
  const [recentTargets, setRecentTargets] = useState<PlayerIndexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<PlayerIndexEntry | null>(null);
  const [combatType, setCombatType] = useState<CombatType>('INTRUSION');
  const [miniGameVisible, setMiniGameVisible] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [legendVisible, setLegendVisible] = useState(false);

  async function scan() {
    if (!user) return;
    void soundService.play('radarScan');
    setLoading(true);
    try {
      const [found, activeDebugUids] = await Promise.all([
        fetchRadarTargets(user.uid, 5),
        loadActiveDebugUids(),
      ]);
      const debugEntries = DEBUG_PLAYERS.filter((p) => activeDebugUids.includes(p.uid));
      setTargets([...debugEntries, ...found]);
      setScanCount((n) => n + 1);
      // Persist up to 3 live (non-debug) targets as recent
      if (found.length > 0) {
        const merged = [
          ...found,
          ...recentTargets.filter((r) => !found.some((f) => f.uid === r.uid)),
        ].slice(0, 3);
        setRecentTargets(merged);
        saveRecentTargets(merged);
      }
    } catch (e) {
      console.error('Radar scan failed:', e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRecentTargets().then(setRecentTargets);
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
      <TopBar
        right={<IconButton glyph="?" onPress={() => setLegendVisible(true)} />}
      />
      {/* Header */}
      <LinearGradient
        colors={[Colors.danger + '22', Colors.accent + '11', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGrad}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>THE WIRE</Text>
            <Text style={styles.subtitle}>Find 'em. Size 'em up. Take their cut.</Text>
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
            <Text style={[styles.pillLabel, { color: Colors.textMuted }]}>HOMESTEAD</Text>
            <Text style={[styles.pillValue, { color: Colors.textSecondary }]}>LVL {outpostLevel}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.list}>
        {/* Sector map */}
        <SectorMap
          targets={targets}
          recentTargets={recentTargets}
          myOutpostLevel={outpostLevel}
          selectedUid={selectedTarget?.uid ?? null}
          isScanning={loading}
        />

        {/* Q4: Recent targets */}
        {recentTargets.length > 0 && targets.length === 0 && !loading && (
          <>
            <Text style={styles.sectionHeader}>RECENT</Text>
            {recentTargets.map((target) => (
              <TargetCard
                key={`recent-${target.uid}`}
                target={target}
                outpostLevel={outpostLevel}
                intrusions={intrusions}
                extractions={extractions}
                onAttack={launchAttack}
                dimmed
              />
            ))}
            <View style={styles.divider} />
          </>
        )}

        <Text style={styles.sectionHeader}>CONTACTS</Text>

        {targets.length === 0 && !loading && recentTargets.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>NO SIGNALS DETECTED</Text>
            <Text style={styles.emptyHint}>Tap SCAN to sweep the wire</Text>
          </View>
        )}

        {targets.length > 0 && (
          <>
            {recentTargets.length > 0 && (
              <>
                <Text style={styles.sectionHeader}>RECENT</Text>
                {recentTargets.map((target) => (
                  <TargetCard
                    key={`recent-${target.uid}`}
                    target={target}
                    outpostLevel={outpostLevel}
                    intrusions={intrusions}
                    extractions={extractions}
                    onAttack={launchAttack}
                    dimmed
                  />
                ))}
                <Text style={styles.sectionHeader}>LIVE SCAN</Text>
              </>
            )}
          </>
        )}

        {targets.map((target) => (
          <TargetCard
            key={target.uid}
            target={target}
            outpostLevel={outpostLevel}
            intrusions={intrusions}
            extractions={extractions}
            onAttack={launchAttack}
          />
        ))}

        {targets.length > 0 && (
          <Pressable onPress={scan} disabled={loading} style={styles.rescanRow}>
            <Text style={styles.rescanText}>↻  SWEEP THE WIRE</Text>
          </Pressable>
        )}

        <Text style={styles.footnote}>
          Spin the roulette and pick your bet tier. Higher risk = higher loot. Defender's VAULT and TURRET passively resist.
        </Text>
      </ScrollView>

      <RouletteGame
        visible={miniGameVisible}
        target={selectedTarget}
        combatType={combatType}
        onClose={handleMiniGameClose}
        onResult={handleMiniGameResult}
      />

      <LegendCard visible={legendVisible} onDismiss={() => setLegendVisible(false)} title="WIRE LEGEND" accentColor={Colors.danger}>
        <LegendSection label="COMBAT ACTIONS" />
        <LegendRow left="INTRUSION" right="Spend 1 Breach token" color={Colors.danger} />
        <LegendRow left="" right="Winner steals credits from loser" />
        <LegendRow left="EXTRACTION" right="Spend 1 Beam token" color={Colors.accent} />
        <LegendRow left="" right="Higher loot — harder to win" />
        <LegendSection label="BET TIERS" />
        <LegendRow left="EVEN" right="50% · Power 75 · Loot 150 CR" color={Colors.primary} />
        <LegendRow left="SECTOR" right="33% · Power 110 · Loot 225 CR" color={Colors.accent} />
        <LegendRow left="JACKPOT" right="17% · Power 145 · Loot 350 CR" color={Colors.credits} />
        <LegendRow left="MISS" right="Power 8 · Lose your bet resource" />
        <LegendSection label="DEFENDER POWER" />
        <LegendRow left="THEIR" right="Homestead × 10 + rand(0–49)" color={Colors.danger} />
        <LegendRow left="OUTCOME" right="Attacker power must exceed defender" />
        <LegendSection label="THREAT RATING" />
        <LegendRow left="WEAK   — your homestead leads by 2+" color={Colors.success} />
        <LegendRow left="EVEN   — within 1 homestead level" color={Colors.warning} />
        <LegendRow left="STRONG — their homestead leads" color={Colors.danger} />
        <LegendSection label="PASSIVE DEFENSES" />
        <LegendRow left="VAULT" right="Absorbs % of credits lost" />
        <LegendRow left="TURRET" right="Auto-blocks N attacks/day" />
        <LegendNote text="Combat is resolved server-side. Local POWER preview is the math the server uses; results land in your LEDGER." />
      </LegendCard>
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
  sectionHeader: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
    marginTop: Spacing.xs,
    marginBottom: 2,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.xs,
  },
  targetCardDimmed: {
    opacity: 0.65,
  },
  recentBadge: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 2,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
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
  powerPreview: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: Typography.weights.bold,
    marginTop: 2,
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
