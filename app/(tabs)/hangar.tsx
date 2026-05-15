import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hapticCombatLaunch, hapticCombatWin, hapticCombatLoss } from '@/constants/haptics';
import { soundService } from '@/services/SoundService';
import { adsService } from '@/services/AdsService';
import { LegendCard, LegendSection, LegendRow, LegendNote } from '@/components/LegendCard';
import { IconButton } from '@/components/IconButton';
import { TopBar } from '@/components/TopBar';
import { ResourceBar } from '@/components/ResourceBar';
import { useAuthStore } from '@/store/useAuthStore';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { fetchRadarTargets, PlayerIndexEntry } from '@/services/FirestoreService';
import { DEBUG_PLAYERS, loadActiveDebugUids } from '@/constants/debugPlayers';
import { RouletteGame } from '@/components/RouletteGame';
import { BlackjackMiniGame } from '@/components/BlackjackMiniGame';
import { SectorMap } from '@/components/SectorMap';
import { PreRaidCardModal } from '@/components/PreRaidCardModal';
import { getCardDefinition } from '@/models/Card';
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
  // True when the player has an unexpired vengeance window against this
  // target — shown as a "VENGEANCE" badge in the threat row.
  vengeanceReady?: boolean;
}

function TargetCard({ target, outpostLevel, intrusions, extractions, onAttack, dimmed, vengeanceReady }: TargetCardProps) {
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
            {vengeanceReady && (
              <View style={[styles.threatBadge, { borderColor: Colors.accent, backgroundColor: Colors.accent + '22' }]}>
                <Text style={[styles.threatText, { color: Colors.accent }]}>⚡ VENGEANCE</Text>
              </View>
            )}
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
  const cards = useGameStore((s) => s.cards);
  const outpostLevel = useHabitatStore((s) => s.outpostLevel);

  const [targets, setTargets] = useState<PlayerIndexEntry[]>([]);
  const [recentTargets, setRecentTargets] = useState<PlayerIndexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<PlayerIndexEntry | null>(null);
  const [combatType, setCombatType] = useState<CombatType>('INTRUSION');
  const [miniGameVisible, setMiniGameVisible] = useState(false);
  // Pre-raid card pick — modal is shown after target lock when the player
  // owns ≥1 raid card. Carries selectedCardId through into the mini-game.
  const [cardPickerVisible, setCardPickerVisible] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [legendVisible, setLegendVisible] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const ownedRaidCardCount = Object.entries(cards).reduce(
    (n, [id, c]) => n + (getCardDefinition(id)?.category === 'RAID' ? c : 0),
    0,
  );

  const vengeanceTargets = useGameStore((s) => s.vengeanceTargets);
  const isVengeanceReady = (uid: string): boolean => {
    const expiry = vengeanceTargets[uid];
    return typeof expiry === 'number' && expiry > Date.now();
  };

  async function scan() {
    if (!user) return;
    void soundService.play('radarScan');
    setLoading(true);
    setScanError(null);
    try {
      const [found, activeDebugUids] = await Promise.all([
        fetchRadarTargets(user.uid, outpostLevel, 5),
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
      setScanError('Scan failed — pull down or tap SCAN to retry.');
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
    setSelectedCardId(null);
    // If the player owns any raid cards, give them a chance to pick one
    // before the mini-game opens. Otherwise jump straight to the reels.
    if (ownedRaidCardCount > 0) {
      setCardPickerVisible(true);
    } else {
      setMiniGameVisible(true);
    }
    hapticCombatLaunch();
  }

  function handleCardPick(cardId: string | null) {
    if (cardId) {
      // twin_strike (raid_extra_token_cost): deduct the extra token cost
      // upfront and validate the player can afford it. If not, silently
      // refuse the card and let them pick again.
      const def = getCardDefinition(cardId);
      const extraEffect = def?.effects.find((e) => e.kind === 'raid_extra_token_cost');
      if (extraEffect && extraEffect.kind === 'raid_extra_token_cost') {
        const extra = extraEffect.extraTokens;
        const have =
          combatType === 'INTRUSION'
            ? useGameStore.getState().intrusions
            : useGameStore.getState().extractions;
        if (have < extra) {
          // Not enough tokens — keep the picker open. A tiny UX gap; toast
          // hookup is Phase D polish.
          return;
        }
        const cost = combatType === 'INTRUSION' ? { intrusions: extra } : { extractions: extra };
        useGameStore.getState().subtractResources(cost);
      }
    }
    setSelectedCardId(cardId);
    setCardPickerVisible(false);
    setMiniGameVisible(true);
  }

  function handleCardPickerCancel() {
    // Cancelling refunds the breach/extract token — the player hadn't
    // committed to the raid yet. Same UX as backing out of the wheel.
    if (combatType === 'INTRUSION') {
      useGameStore.setState((s) => ({ intrusions: s.intrusions + 1 }));
    } else {
      useGameStore.setState((s) => ({ extractions: s.extractions + 1 }));
    }
    setCardPickerVisible(false);
    setSelectedTarget(null);
    setSelectedCardId(null);
  }

  function handleMiniGameResult(won: boolean) {
    if (won) hapticCombatWin(); else hapticCombatLoss();
  }

  function handleMiniGameClose() {
    setMiniGameVisible(false);
    setSelectedTarget(null);
    setSelectedCardId(null);
    // Post-combat interstitial — frequency-capped to once every 4 minutes
    // globally so a fast raid streak doesn't bombard players. Only fires
    // after EXTRACTIONs to leave the snappier INTRUSION flow ad-free.
    if (combatType === 'EXTRACTION') {
      void adsService.maybeShowInterstitial('post-extraction');
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <TopBar
        right={<IconButton glyph="?" onPress={() => setLegendVisible(true)} />}
      />
      <ResourceBar compact />
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

      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={scan}
            tintColor={Colors.accent}
            colors={[Colors.accent]}
          />
        }
      >
        {scanError ? (
          <Pressable onPress={scan} style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>⚠  {scanError}</Text>
          </Pressable>
        ) : null}
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
                vengeanceReady={isVengeanceReady(target.uid)}
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
            vengeanceReady={isVengeanceReady(target.uid)}
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

      <PreRaidCardModal
        visible={cardPickerVisible}
        combatType={combatType}
        onPick={handleCardPick}
        onCancel={handleCardPickerCancel}
      />

      {combatType === 'EXTRACTION' ? (
        <BlackjackMiniGame
          visible={miniGameVisible}
          target={selectedTarget}
          combatType={combatType}
          cardId={selectedCardId}
          onClose={handleMiniGameClose}
          onResult={handleMiniGameResult}
        />
      ) : (
        <RouletteGame
          visible={miniGameVisible}
          target={selectedTarget}
          combatType={combatType}
          cardId={selectedCardId}
          onClose={handleMiniGameClose}
          onResult={handleMiniGameResult}
        />
      )}

      <LegendCard visible={legendVisible} onDismiss={() => setLegendVisible(false)} title="WIRE LEGEND" accentColor={Colors.danger}>
        <LegendSection label="COMBAT ACTIONS" />
        <LegendRow left="INTRUSION" right="Spend 1 Breach · Roulette wheel" color={Colors.danger} />
        <LegendRow left="EXTRACTION" right="Spend 1 Beam · Blackjack hand" color={Colors.accent} />
        <LegendRow left="" right="Winner takes credits from loser — closed loop" />
        <LegendSection label="ROULETTE TIERS (BREACH)" />
        <LegendRow left="EVEN" right="42% · Power 75" color={Colors.primary} />
        <LegendRow left="SECTOR" right="25% · Power 110" color={Colors.accent} />
        <LegendRow left="JACKPOT" right="8%  · Power 145" color={Colors.credits} />
        <LegendRow left="MISS" right="Power 8 · Lose your bet resource" />
        <LegendSection label="BLACKJACK TIERS (BEAM)" />
        <LegendRow left="17–19" right="Power 90"  color={Colors.primary} />
        <LegendRow left="20"    right="Power 110" color={Colors.accent} />
        <LegendRow left="21"    right="Power 130" color={Colors.credits} />
        <LegendRow left="BLACKJACK" right="Power 145 (21 in 2 cards)" color={Colors.credits} />
        <LegendSection label="LOOT" />
        <LegendRow left="EVEN tier"   right="5% of target wallet · 100–250 CR cap"  color={Colors.primary} />
        <LegendRow left="SECTOR tier" right="8% of target wallet · 150–400 CR cap"  color={Colors.accent} />
        <LegendRow left="JACKPOT"     right="12% of target wallet · 250–700 CR cap" color={Colors.credits} />
        <LegendRow left="ANOMALY" right="RAID_SHADOW +50% · VOID_STORM +20%" />
        <LegendRow left="RAIDER drone" right="+40% on next raid launch" />
        <LegendSection label="DEFENDER POWER" />
        <LegendRow left="FORMULA" right="Homestead × 11 + 25 + rand(0–40)" color={Colors.danger} />
        <LegendRow left="OUTCOME" right="Attacker power must exceed defender" />
        <LegendSection label="THREAT RATING" />
        <LegendRow left="WEAK"   right="Their homestead lower than yours" color={Colors.success} />
        <LegendRow left="EVEN"   right="Within 1 homestead level"        color={Colors.warning} />
        <LegendRow left="STRONG" right="Their homestead leads"            color={Colors.danger} />
        <LegendSection label="PASSIVE DEFENSES" />
        <LegendRow left="VAULT"  right="Reduces credits lost (5% / level, max 75%)" />
        <LegendRow left="TURRET" right="Auto-blocks N attacks/day" />
        <LegendNote text="Combat is resolved server-side. RADAR shows opponents within ±2..+3 of your homestead." />
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
  errorBanner: {
    backgroundColor: Colors.danger + '22',
    borderColor: Colors.danger,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  errorBannerText: {
    fontSize: Typography.sizes.xs,
    color: Colors.danger,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
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
