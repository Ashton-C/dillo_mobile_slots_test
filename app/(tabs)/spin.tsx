import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, ScrollView, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { hapticForSpinResult, hapticActivateBuff, hapticLevelUp } from '@/constants/haptics';
import { LegendCard, LegendSection, LegendRow, LegendNote } from '@/components/LegendCard';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import { useGameStore } from '@/store/useGameStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useEventStore } from '@/store/useEventStore';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
import { BACKGROUND_TOKENS } from '@/services/CosmeticsService';
import { SpinButton } from '@/components/SpinButton';
import { ReelDisplay } from '@/components/ReelDisplay';
import { ResourceBar } from '@/components/ResourceBar';
import { RiftSelector } from '@/components/RiftSelector';
import { ModifierPanel } from '@/components/ModifierPanel';
import { JackpotBurst } from '@/components/JackpotBurst';
import { LedgerDrawer } from '@/components/LedgerDrawer';
import { ConfettiEmitter } from '@/components/ConfettiEmitter';
import { OnboardingModal } from '@/components/OnboardingModal';
import { BuildCompleteBanner } from '@/components/BuildCompleteBanner';
import { TooltipPopover } from '@/components/TooltipPopover';
import { useShakeAnimation } from '@/hooks/useShakeAnimation';
import { soundService } from '@/services/SoundService';
import { OddsModal } from '@/components/OddsModal';
import { useDroneStore } from '@/store/useDroneStore';
import { anomalyService } from '@/services/AnomalyService';
import { getMaxSpins } from '@/models/Habitat';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';
import { SpinResult, TemporalRiftTier } from '@/services/SlotsEngine';

const EMPTY_REELS: ['EMPTY', 'EMPTY', 'EMPTY'] = ['EMPTY', 'EMPTY', 'EMPTY'];
const LOW_SPIN_THRESHOLD = 5;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const SCANLINE_OFFSETS = Array.from({ length: 16 }, (_, i) => i * 4);

const OUTCOME_COLOR: Record<string, string> = {
  CREDITS:    Colors.credits,
  ATTACK:     Colors.attack,
  RAID:       Colors.raid,
  SHIELD:     Colors.shield,
  INTRUSION:  Colors.danger,
  EXTRACTION: Colors.accent,
};

function isTriple(result: SpinResult): boolean {
  return result.outcomeType !== 'NOTHING' &&
    result.reels[0] === result.reels[1] &&
    result.reels[1] === result.reels[2];
}

function formatRefillTimer(ms: number): string {
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatPayout(result: SpinResult): string {
  const parts: string[] = [];
  if (result.creditsWon > 0)     parts.push(`+${result.creditsWon.toLocaleString()} CR`);
  if (result.attacksWon > 0)     parts.push(`+${result.attacksWon} FUEL`);
  if (result.raidsWon > 0)       parts.push(`+${result.raidsWon} SIGNAL`);
  if (result.shieldsWon > 0)     parts.push(`+${result.shieldsWon} SHIELD`);
  if (result.intrusionsWon > 0)  parts.push(`+${result.intrusionsWon} BREACH`);
  if (result.extractionsWon > 0) parts.push(`+${result.extractionsWon} BEAM`);
  return parts.join('  ·  ') || '—';
}

export default function SpinScreen() {
  const {
    credits, attacks, raids, shields, intrusions, extractions, spinsRemaining,
    isSpinning, lastResult, reelWindow, activeWinLines, riftTier, level,
    msUntilNextSpin, msUntilFull,
    overclockActive, signalBoostActive,
    spin, setRiftTier, activateOverclock, activateSignalBoost,
  } = useGameStore();

  const { displayName } = useAuthStore();
  const latestEvent = useEventStore((s) => s.events[0]);
  const generatorLevel  = useHabitatStore((s) => s.buildingLevels.GENERATOR ?? 0);
  const barracksLevel   = useHabitatStore((s) => s.buildingLevels.BARRACKS  ?? 0);
  const overclockBonusPreview = generatorLevel * 40 + 100;
  const spinCap = getMaxSpins(barracksLevel);

  const activeBgId = useCosmeticsStore((s) => s.active['BACKGROUND'] ?? 'bg_default');
  const bgTokens   = BACKGROUND_TOKENS[activeBgId] ?? BACKGROUND_TOKENS.bg_default;
  const { load: loadCosmetics } = useCosmeticsStore();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

  useEffect(() => { loadCosmetics(); }, []);

  const [burstVisible, setBurstVisible]       = useState(false);
  const [confettiActive, setConfettiActive]   = useState(false);
  const [legendVisible, setLegendVisible]     = useState(false);
  const [historyVisible, setHistoryVisible]   = useState(false);
  const [oddsVisible, setOddsVisible]         = useState(false);
  const [riftModalVisible, setRiftModalVisible] = useState(false);
  const [muted, setMuted]                     = useState(() => soundService.getMuted());
  const [tooltipVisible, setTooltipVisible]   = useState(false);
  const [tooltipText, setTooltipText]         = useState('');
  const [contentH, setContentH]               = useState(0);
  const [containerH, setContainerH]           = useState(0);
  const contentOverflows = contentH > containerH + 1;

  const tooltipTimer = useRef<ReturnType<typeof setTimeout>>();
  const showTooltip = (text: string) => {
    clearTimeout(tooltipTimer.current);
    setTooltipText(text);
    setTooltipVisible(true);
    tooltipTimer.current = setTimeout(() => setTooltipVisible(false), 3200);
  };
  const hideTooltip = () => {
    clearTimeout(tooltipTimer.current);
    setTooltipVisible(false);
  };

  const droneEffects = useDroneStore((s) => s.getEffects());
  const anomalyMultiplier = anomalyService.getDefinition()?.creditMultiplier ?? 1;
  const activeCreditMultiplier = droneEffects.creditMultiplier * anomalyMultiplier;
  const overclockBonusForOdds = generatorLevel * 40 + 100;
  const burstTimerRef   = useRef<ReturnType<typeof setTimeout>>();
  const confettiTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const spinHapticRef   = useRef<ReturnType<typeof setInterval>>();
  const lastEventId     = useRef<string | undefined>(undefined);

  const { shakeStyle, shake } = useShakeAnimation();

  useEffect(() => {
    if (isSpinning) {
      let ticks = 0;
      spinHapticRef.current = setInterval(() => {
        ticks++;
        Haptics.selectionAsync();
        if (ticks >= 5) clearInterval(spinHapticRef.current);
      }, 110);
    } else {
      clearInterval(spinHapticRef.current);
    }
    return () => clearInterval(spinHapticRef.current);
  }, [isSpinning]);

  const flashOpacity = useSharedValue(0);
  const prevJackpot  = useRef(false);
  const flashStyle   = useAnimatedStyle(() => ({ opacity: flashOpacity.value }));

  const tripleBadgeY     = useSharedValue(-40);
  const tripleBadgeScale = useSharedValue(0.4);
  const tripleBadgeOp    = useSharedValue(0);
  const tripleBadgeStyle = useAnimatedStyle(() => ({
    opacity:   tripleBadgeOp.value,
    transform: [{ translateY: tripleBadgeY.value }, { scale: tripleBadgeScale.value }],
  }));

  const beamY    = useSharedValue(-4);
  const beamOp   = useSharedValue(0);
  const beamStyle = useAnimatedStyle(() => ({
    opacity:   beamOp.value,
    transform: [{ translateY: beamY.value }],
  }));

  const lvlBadgeY     = useSharedValue(-140);
  const lvlBadgeScale = useSharedValue(0);
  const lvlBadgeOp    = useSharedValue(0);
  const lvlBadgeStyle = useAnimatedStyle(() => ({
    opacity:   lvlBadgeOp.value,
    transform: [{ translateY: lvlBadgeY.value }, { scale: lvlBadgeScale.value }],
  }));

  useEffect(() => {
    const isJackpot = lastResult?.isJackpot ?? false;
    if (isJackpot && !prevJackpot.current) {
      hapticForSpinResult(lastResult!);
      void soundService.play('jackpot');
      flashOpacity.value = withSequence(
        withTiming(1, { duration: 60 }),
        withTiming(0, { duration: 280 }),
        withTiming(0.7, { duration: 60 }),
        withTiming(0, { duration: 400 }),
      );
      shake();
      setBurstVisible(true);
      burstTimerRef.current = setTimeout(() => setBurstVisible(false), 1100);
      setConfettiActive(true);
      confettiTimerRef.current = setTimeout(() => setConfettiActive(false), 2800);
    }
    prevJackpot.current = isJackpot;
    return () => clearTimeout(burstTimerRef.current);
  }, [lastResult]);

  const bannerScale = useSharedValue(1);
  useEffect(() => {
    if (lastResult && lastResult.outcomeType !== 'NOTHING') {
      if (!lastResult.isJackpot) {
        hapticForSpinResult(lastResult);
        soundService.playCoinWin(lastResult.creditsWon);
      }
      bannerScale.value = withSequence(
        withTiming(1.06, { duration: 70 }),
        withSpring(1, { damping: 5, stiffness: 200 }),
      );
      if (isTriple(lastResult)) {
        tripleBadgeY.value     = -40;
        tripleBadgeScale.value = 0.4;
        tripleBadgeOp.value    = 0;
        tripleBadgeY.value     = withSpring(0, { damping: 9, stiffness: 220 });
        tripleBadgeScale.value = withSpring(1, { damping: 7, stiffness: 240 });
        tripleBadgeOp.value    = withSequence(
          withTiming(1, { duration: 70 }),
          withDelay(1000, withTiming(0, { duration: 400 })),
        );
      }
    }
  }, [lastResult]);
  const bannerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bannerScale.value }],
  }));

  const levelFlash    = useSharedValue(0);
  const prevLevel     = useRef(level);
  const levelFlashStyle = useAnimatedStyle(() => ({ opacity: levelFlash.value }));

  useEffect(() => {
    if (level > prevLevel.current) {
      hapticLevelUp();
      void soundService.play('levelUp');
      levelFlash.value = withSequence(
        withTiming(1, { duration: 80 }),
        withTiming(0.6, { duration: 120 }),
        withTiming(1, { duration: 80 }),
        withTiming(0, { duration: 500 }),
      );
      beamY.value  = -4;
      beamOp.value = 0;
      beamOp.value = withSequence(
        withTiming(1, { duration: 60 }),
        withDelay(650, withTiming(0, { duration: 200 })),
      );
      beamY.value = withTiming(SCREEN_HEIGHT + 4, { duration: 820, easing: Easing.inOut(Easing.quad) });
      lvlBadgeY.value     = -140;
      lvlBadgeScale.value = 0;
      lvlBadgeOp.value    = 0;
      lvlBadgeScale.value = withDelay(280, withSpring(1, { damping: 10, stiffness: 200 }));
      lvlBadgeY.value     = withDelay(280, withSpring(0, { damping: 12, stiffness: 200 }));
      lvlBadgeOp.value    = withDelay(280, withSequence(
        withTiming(1, { duration: 120 }),
        withDelay(1500, withTiming(0, { duration: 400 })),
      ));
    }
    prevLevel.current = level;
  }, [level]);

  useEffect(() => {
    if (!latestEvent) return;
    if (latestEvent.id === lastEventId.current) return;
    lastEventId.current = latestEvent.id;
    if (latestEvent.type === 'ATTACK_INCOMING' || latestEvent.type === 'RAID_INCOMING' || latestEvent.type === 'ATTACK_RESOLVED' || latestEvent.type === 'RAID_RESOLVED') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      void soundService.play('pvpIncoming');
      shake();
    }
  }, [latestEvent]);

  const reels = lastResult?.reels ?? reelWindow?.[1] ?? EMPTY_REELS;
  const canSpin = spinsRemaining > 0 && !isSpinning;
  const showCombatResources = intrusions > 0 || extractions > 0;
  const spinsLow = spinsRemaining <= LOW_SPIN_THRESHOLD;

  const payoutColor = lastResult && lastResult.outcomeType !== 'NOTHING'
    ? (OUTCOME_COLOR[lastResult.outcomeType] ?? Colors.primary)
    : Colors.textMuted;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.jackpotFlash, flashStyle]}
      />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.levelUpFlash, levelFlashStyle]}
      />

      <JackpotBurst visible={burstVisible} creditsWon={lastResult?.creditsWon ?? 0} />
      <BuildCompleteBanner />
      <ConfettiEmitter active={confettiActive} />
      <OnboardingModal onDone={() => {}} />

      <Animated.View pointerEvents="none" style={[styles.scannerBeam, beamStyle]} />

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.levelBadgeOverlay]}
      >
        <Animated.View style={[styles.levelBadgeCard, lvlBadgeStyle]}>
          <Text style={styles.levelBadgeLabel}>LEVEL UP</Text>
          <Text style={styles.levelBadgeNum}>{level}</Text>
        </Animated.View>
      </Animated.View>

      {/* Tooltip popover — absolute over entire screen */}
      <TooltipPopover
        label={tooltipText}
        visible={tooltipVisible}
        onDismiss={hideTooltip}
        bottom={tabBarHeight + insets.bottom + 100}
      />

      <Animated.View style={[{ flex: 1 }, shakeStyle]}>

      <LinearGradient
        colors={bgTokens.gradientColors as [string, string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <ResourceBar
          credits={credits}
          attacks={attacks}
          raids={raids}
          shields={shields}
          spinsRemaining={spinsRemaining}
          displayName={displayName ?? undefined}
          style={styles.resourceBarTransparent}
        />
      </LinearGradient>

      <ModifierPanel />

      <ScrollView
        style={styles.contentScroll}
        contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={contentOverflows}
        scrollEnabled={contentOverflows}
        onContentSizeChange={(_, h) => setContentH(h)}
        onLayout={(e) => setContainerH(e.nativeEvent.layout.height)}
      >
        {/* Digital payout indicator — fixed 64px, always rendered */}
        <View style={styles.payoutArea}>
          <Animated.View pointerEvents="none" style={[styles.tripleBadgeWrap, tripleBadgeStyle]}>
            <Text style={[styles.tripleBadgeText, { color: OUTCOME_COLOR[lastResult?.outcomeType ?? ''] ?? Colors.primary }]}>
              TRIPLE!
            </Text>
          </Animated.View>
          <Animated.View style={[styles.payoutPanel, bannerStyle]}>
            {/* Scanline overlay */}
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              {SCANLINE_OFFSETS.map((top, i) => (
                <View key={i} style={[styles.scanline, { top }]} />
              ))}
            </View>
            <Text style={styles.payoutLabel}>PAYOUT</Text>
            <Text style={[styles.payoutValue, { color: payoutColor }]} numberOfLines={1}>
              {lastResult && lastResult.outcomeType !== 'NOTHING'
                ? formatPayout(lastResult)
                : '—'}
            </Text>
          </Animated.View>
        </View>

        <ReelDisplay
          reels={reels}
          isSpinning={isSpinning}
          lastResult={lastResult}
          reelWindow={reelWindow}
          activeWinLines={activeWinLines}
        />

        <View style={styles.spinZone}>
          {/* Cockpit action row */}
          <View style={styles.cockpitRow}>
            <View style={styles.actionStack}>
              {/* Rift */}
              <View style={styles.actionItem}>
                <Pressable
                  style={[styles.actionBtn, riftTier > 0 && styles.actionBtnAccent]}
                  onPress={() => setRiftModalVisible(true)}
                  onLongPress={() => showTooltip('Temporal Rift: shifts symbol weights toward credits. Higher tiers cost more but yield bigger wins.')}
                  delayLongPress={450}
                >
                  <Text style={[styles.actionBtnGlyph, riftTier > 0 && { color: Colors.accent }]}>◌</Text>
                  {riftTier > 0 && <Text style={[styles.actionBtnBadge, { color: Colors.accent }]}>T{riftTier}</Text>}
                </Pressable>
                <Text style={[styles.actionLabel, riftTier > 0 && { color: Colors.accent }]}>RIFT</Text>
              </View>

              {/* Overclock */}
              <View style={styles.actionItem}>
                <Pressable
                  style={[
                    styles.actionBtn,
                    overclockActive && styles.actionBtnAttack,
                    attacks <= 0 && !overclockActive && styles.actionBtnDim,
                  ]}
                  onPress={() => { activateOverclock(); hapticActivateBuff(); }}
                  disabled={overclockActive}
                  onLongPress={() => showTooltip(`Overclock: +${overclockBonusPreview} CR next spin. Costs 1 Fuel Cell.`)}
                  delayLongPress={450}
                >
                  <Text style={[styles.actionBtnGlyph, overclockActive && { color: Colors.attack }]}>⚡</Text>
                  {attacks > 0 && !overclockActive && <Text style={[styles.actionBtnBadge, { color: Colors.attack }]}>{attacks}</Text>}
                </Pressable>
                <Text style={[styles.actionLabel, overclockActive && { color: Colors.attack }]}>OC</Text>
              </View>

              {/* Signal Boost */}
              <View style={styles.actionItem}>
                <Pressable
                  style={[
                    styles.actionBtn,
                    signalBoostActive && styles.actionBtnRaid,
                    raids <= 0 && !signalBoostActive && styles.actionBtnDim,
                  ]}
                  onPress={() => { activateSignalBoost(); hapticActivateBuff(); }}
                  disabled={signalBoostActive}
                  onLongPress={() => showTooltip('Signal Boost: ×1.5 credit symbol weights next spin. Costs 1 Signal.')}
                  delayLongPress={450}
                >
                  <Text style={[styles.actionBtnGlyph, signalBoostActive && { color: Colors.raid }]}>▲▲</Text>
                  {raids > 0 && !signalBoostActive && <Text style={[styles.actionBtnBadge, { color: Colors.raid }]}>{raids}</Text>}
                </Pressable>
                <Text style={[styles.actionLabel, signalBoostActive && { color: Colors.raid }]}>BOOST</Text>
              </View>

              {/* Ledger */}
              <View style={styles.actionItem}>
                <Pressable
                  style={styles.actionBtn}
                  onPress={() => setHistoryVisible(true)}
                  onLongPress={() => showTooltip('Ledger: view spin history, modifier receipts, and combat log.')}
                  delayLongPress={450}
                >
                  <Text style={styles.actionBtnGlyph}>↑</Text>
                </Pressable>
                <Text style={styles.actionLabel}>LOG</Text>
              </View>
            </View>

            <SpinButton onPress={spin} disabled={!canSpin} isSpinning={isSpinning} />
          </View>

          <Text style={[styles.spinsLabel, spinsLow && styles.spinsLabelLow]}>
            {spinsRemaining} / {spinCap} spins
          </Text>
          {spinsRemaining < spinCap && msUntilNextSpin > 0 && (
            <View style={styles.refillRow}>
              <Text style={[styles.refillNext, spinsLow && styles.refillNextLow]}>
                NEXT SPIN  {formatRefillTimer(msUntilNextSpin)}
              </Text>
              {spinsRemaining < spinCap - 1 && (
                <Text style={styles.refillFull}>
                  FULL  {formatRefillTimer(msUntilFull)}
                </Text>
              )}
            </View>
          )}
        </View>

        {showCombatResources && (
          <View style={styles.combatRow}>
            {intrusions > 0 && (
              <View style={[styles.combatChip, { borderColor: Colors.danger }]}>
                <Text style={[styles.combatChipText, { color: Colors.danger }]}>⚔  {intrusions} BREACH KEY{intrusions !== 1 ? 'S' : ''}</Text>
              </View>
            )}
            {extractions > 0 && (
              <View style={[styles.combatChip, { borderColor: Colors.accent }]}>
                <Text style={[styles.combatChipText, { color: Colors.accent }]}>⛏  {extractions} BEAM{extractions !== 1 ? 'S' : ''}</Text>
              </View>
            )}
            <Text style={styles.combatHint}>→ RADAR</Text>
          </View>
        )}
      </ScrollView>
      </Animated.View>

      <LedgerDrawer visible={historyVisible} onClose={() => setHistoryVisible(false)} />

      {/* Rift selector modal */}
      <Modal
        visible={riftModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setRiftModalVisible(false)}
      >
        <Pressable style={styles.riftModalBackdrop} onPress={() => setRiftModalVisible(false)}>
          <Pressable style={styles.riftModalContent} onPress={() => {}}>
            <View style={styles.riftModalHandle} />
            <RiftSelector
              currentTier={riftTier}
              availableCredits={credits}
              onSelect={(tier: TemporalRiftTier) => { setRiftTier(tier); setRiftModalVisible(false); }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Pressable
        style={[styles.legendBtn, { right: Spacing.md + 72, top: insets.top + 6 }]}
        onPress={() => setOddsVisible(true)}
        hitSlop={12}
      >
        <Text style={styles.legendBtnText}>%</Text>
      </Pressable>

      {/* Mute button — larger than % and ? */}
      <Pressable
        style={[styles.legendBtn, styles.legendBtnLarge, { right: Spacing.md + 42, top: insets.top + 2 }, muted && styles.legendBtnMuted]}
        onPress={() => {
          const next = !muted;
          setMuted(next);
          void soundService.setMuted(next);
        }}
        hitSlop={12}
      >
        <Text style={[styles.legendBtnTextLarge, !muted && { color: Colors.accent }]}>{muted ? '✕' : '♪'}</Text>
      </Pressable>

      <Pressable style={[styles.legendBtn, { top: insets.top + 6 }]} onPress={() => setLegendVisible(true)} hitSlop={12}>
        <Text style={styles.legendBtnText}>?</Text>
      </Pressable>

      <OddsModal
        visible={oddsVisible}
        onClose={() => setOddsVisible(false)}
        riftTier={riftTier}
        signalBoost={signalBoostActive}
        creditMultiplier={activeCreditMultiplier}
        overclockBonus={overclockBonusForOdds}
      />

      <LegendCard visible={legendVisible} onDismiss={() => setLegendVisible(false)} title="SPIN LEGEND" accentColor={Colors.primary}>
        <LegendSection label="SYMBOLS — PAIR / TRIPLE" />
        <LegendRow left="⚡ Fuel Cell" right="+1 FUEL  /  +3 FUEL" />
        <LegendRow left="◈ Beam Signal" right="+1 BEAM  /  +2 BEAM" />
        <LegendRow left="◈ Shield" right="+1  /  +3" />
        <LegendRow left="● CR Small" right="+20 CR  /  +100 CR" />
        <LegendRow left="●● CR Medium" right="+100 CR  /  +500 CR" />
        <LegendRow left="★ CR Large" right="+400 CR  /  +2000 CR ★" color={Colors.credits} />
        <LegendSection label="RIFT — COST · WEIGHT DELTAS" />
        <LegendRow left="T0 free" right="standard odds" />
        <LegendRow left="T1 50 CR" right="+5 ●  +3 ●●  −4 EMPTY" color={Colors.success} />
        <LegendRow left="T2 150 CR" right="+8 ●●  +5 ★  −5 EMPTY" color={Colors.success} />
        <LegendRow left="T3 400 CR" right="+12 ★  +6 ●●  −10 ●" color={Colors.credits} />
        <LegendSection label="SPIN ABILITIES" />
        <LegendRow left="⚡ OVERCLOCK" right={`+${overclockBonusPreview} CR · 1 FUEL`} color={Colors.attack} />
        <LegendRow left="" right={`= GEN LVL ${generatorLevel} × 50 + 200`} />
        <LegendRow left="▲▲ BOOST" right="1 SIGNAL · ×1.5 CR weights" color={Colors.raid} />
        <LegendNote text="Multipliers stack: base × DRONE × ANOMALY + OVERCLOCK − RIFT cost. See LEDGER for the receipt." />
      </LegendCard>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  jackpotFlash: {
    backgroundColor: Colors.credits + '66',
    zIndex: 99,
  },
  levelUpFlash: {
    backgroundColor: Colors.accent + '44',
    zIndex: 98,
  },

  resourceBarTransparent: {
    backgroundColor: 'transparent',
    borderBottomColor: Colors.border + '55',
  },

  contentScroll: { flex: 1 },
  content: { paddingTop: Spacing.sm, gap: Spacing.md },

  // Digital payout indicator
  payoutArea: {
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    width: '100%',
  },
  tripleBadgeWrap: {
    position: 'absolute',
    top: -32,
    alignItems: 'center',
    zIndex: 10,
  },
  tripleBadgeText: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    letterSpacing: 4,
  },
  payoutPanel: {
    width: '100%',
    height: 64,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.info + '55',
    borderRadius: BorderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  scanline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.info,
    opacity: 0.04,
  },
  payoutLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    letterSpacing: 2,
    fontWeight: Typography.weights.bold,
  },
  payoutValue: {
    flex: 1,
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
    textAlign: 'right',
  },

  spinZone: { alignItems: 'center', gap: Spacing.sm },

  // Cockpit row
  cockpitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  actionStack: {
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  actionItem: {
    alignItems: 'center',
    gap: 3,
  },
  actionLabel: {
    fontSize: 8,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1.2,
    color: Colors.textMuted,
  },
  actionBtn: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionBtnAccent: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '1A',
  },
  actionBtnAttack: {
    borderColor: Colors.attack,
    backgroundColor: Colors.attack + '1A',
  },
  actionBtnRaid: {
    borderColor: Colors.raid,
    backgroundColor: Colors.raid + '1A',
  },
  actionBtnDim: {
    opacity: 0.35,
  },
  actionBtnGlyph: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
  },
  actionBtnBadge: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },

  spinsLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  spinsLabelLow: {
    color: Colors.warning,
    fontWeight: Typography.weights.bold,
  },
  refillRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
    alignItems: 'center',
  },
  refillNext: {
    fontSize: Typography.sizes.xs,
    color: Colors.accent,
    letterSpacing: 1,
    fontWeight: Typography.weights.bold,
  },
  refillNextLow: {
    color: Colors.warning,
  },
  refillFull: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },

  combatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  combatChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    backgroundColor: Colors.surface,
  },
  combatChipText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  combatHint: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
    marginLeft: Spacing.xs,
  },

  scannerBeam: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 3,
    backgroundColor: Colors.accent + 'DD',
    zIndex: 97,
  },
  levelBadgeOverlay: {
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 96,
  },
  levelBadgeCard: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.accent,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    gap: 4,
  },
  levelBadgeLabel: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 4,
  },
  levelBadgeNum: {
    fontSize: Typography.sizes.hero,
    fontWeight: Typography.weights.bold,
    color: Colors.accent,
    lineHeight: 56,
  },

  legendBtn: {
    position: 'absolute',
    top: 6,
    right: Spacing.md,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  legendBtnLarge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
  },
  legendBtnMuted: {
    opacity: 0.45,
  },
  legendBtnText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
  },
  legendBtnTextLarge: {
    fontSize: Typography.sizes.md,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
  },

  riftModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  riftModalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  riftModalHandle: {
    width: 40,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
});
