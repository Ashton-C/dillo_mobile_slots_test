import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGameStore } from '@/store/useGameStore';
import { LegendCard, LegendSection, LegendRow, LegendNote } from '@/components/LegendCard';
import { AdWatchModal } from '@/components/AdWatchModal';
import { hapticBuildComplete, hapticActivateBuff } from '@/constants/haptics';
import {
  PACKS,
  AD_REWARDS,
  StorePack,
  AdReward,
  PackReward,
  getAdReadyAt,
  markAdClaimed,
} from '@/services/StoreService';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

interface SuitOption {
  id: string;
  label: string;
  color: string;
  creditCost: number;
}

interface ThemeOption {
  id: string;
  label: string;
  desc: string;
  creditCost: number;
}

const SUIT_OPTIONS: SuitOption[] = [
  { id: 'suit_default', label: 'ORIGINAL',   color: Colors.primary,  creditCost: 0 },
  { id: 'suit_void',    label: 'VOID',        color: Colors.accent,   creditCost: 0 },
  { id: 'suit_neon',    label: 'NEON PINK',   color: '#FF2D78',       creditCost: 500 },
  { id: 'suit_acid',    label: 'ACID',        color: Colors.success,  creditCost: 500 },
  { id: 'suit_ice',     label: 'ICE',         color: Colors.shield,   creditCost: 500 },
];

const THEME_OPTIONS: ThemeOption[] = [
  { id: 'theme_standard', label: 'STANDARD',    desc: 'Original dark theme',      creditCost: 0 },
  { id: 'theme_neon',     label: 'NEON PULSE',  desc: 'Electric glow aesthetic',  creditCost: 1000 },
  { id: 'theme_cyber',    label: 'CYBER GOLD',  desc: 'Gold & chrome finish',     creditCost: 1000 },
];

const OWNED_KEY = (id: string) => `cosmetic:${id}:owned`;
const ACTIVE_SUIT_KEY = 'cosmetic:active_suit';
const ACTIVE_THEME_KEY = 'cosmetic:active_theme';

function formatRewards(r: PackReward): string {
  const parts: string[] = [];
  if (r.spinRefill) parts.push('SPINS REFILLED');
  if (r.credits)    parts.push(`+${r.credits.toLocaleString()} CR`);
  if (r.fuel)       parts.push(`+${r.fuel} FUEL`);
  if (r.boost)      parts.push(`+${r.boost} BOOST`);
  if (r.shields)    parts.push(`+${r.shields} SHIELD`);
  return parts.join(' · ');
}

function formatCooldown(ms: number): string {
  if (ms <= 0) return 'READY';
  const totalSec = Math.ceil(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function StoreScreen() {
  const grantResources = useGameStore((s) => s.grantResources);
  const subtractCredits = useGameStore((s) => s.subtractCredits);
  const credits = useGameStore((s) => s.credits);

  const [adReadyAt, setAdReadyAt] = useState<Record<string, number>>({});
  const [now, setNow]             = useState(Date.now());
  const [adActive, setAdActive]   = useState<AdReward | null>(null);
  const [pendingPack, setPendingPack] = useState<StorePack | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [legendVisible, setLegendVisible] = useState(false);

  // Cosmetics state
  const [ownedCosmetics, setOwnedCosmetics] = useState<Set<string>>(new Set(['suit_default', 'suit_void', 'theme_standard']));
  const [activeSuit, setActiveSuit]   = useState('suit_default');
  const [activeTheme, setActiveTheme] = useState('theme_standard');

  // Refresh ad cooldowns once a second while screen is visible
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Load ad cooldowns from AsyncStorage on mount
  useEffect(() => {
    Promise.all(AD_REWARDS.map(async (a) => [a.id, await getAdReadyAt(a.id)] as const))
      .then((entries) => {
        const map: Record<string, number> = {};
        entries.forEach(([id, ts]) => { map[id] = ts; });
        setAdReadyAt(map);
      });
  }, []);

  // Load cosmetics from AsyncStorage on mount
  useEffect(() => {
    async function loadCosmetics() {
      const allIds = [...SUIT_OPTIONS.map((s) => s.id), ...THEME_OPTIONS.map((t) => t.id)];
      const results = await Promise.all(allIds.map(async (id) => [id, await AsyncStorage.getItem(OWNED_KEY(id))] as const));
      const owned = new Set<string>(['suit_default', 'suit_void', 'theme_standard']);
      results.forEach(([id, val]) => { if (val === 'true') owned.add(id); });
      const suit  = await AsyncStorage.getItem(ACTIVE_SUIT_KEY);
      const theme = await AsyncStorage.getItem(ACTIVE_THEME_KEY);
      setOwnedCosmetics(owned);
      if (suit)  setActiveSuit(suit);
      if (theme) setActiveTheme(theme);
    }
    loadCosmetics();
  }, []);

  function handleAdTap(ad: AdReward) {
    const ready = (adReadyAt[ad.id] ?? 0) <= now;
    if (!ready) return;
    setAdActive(ad);
  }

  function handleAdComplete() {
    if (!adActive) return;
    grantResources(adActive.reward);
    markAdClaimed(adActive.id, adActive.cooldownMs);
    setAdReadyAt((prev) => ({ ...prev, [adActive.id]: Date.now() + adActive.cooldownMs }));
    setConfirmation(`Reward claimed: ${formatRewards(adActive.reward)}`);
    setTimeout(() => setConfirmation(null), 2200);
    setAdActive(null);
  }

  function handlePurchase(pack: StorePack) {
    setPendingPack(pack);
  }

  function confirmPurchase() {
    if (!pendingPack) return;
    grantResources(pendingPack.rewards);
    hapticBuildComplete();
    setConfirmation(`Purchased: ${pendingPack.label} — ${formatRewards(pendingPack.rewards)}`);
    setTimeout(() => setConfirmation(null), 2200);
    setPendingPack(null);
  }

  function handleCosmeticBuy(id: string, cost: number) {
    if (ownedCosmetics.has(id)) return;
    if (!subtractCredits(cost)) {
      setConfirmation('Not enough credits');
      setTimeout(() => setConfirmation(null), 1800);
      return;
    }
    hapticActivateBuff();
    setOwnedCosmetics((prev) => new Set([...prev, id]));
    AsyncStorage.setItem(OWNED_KEY(id), 'true');
    setConfirmation(`Unlocked: ${id}`);
    setTimeout(() => setConfirmation(null), 1800);
  }

  function handleActivateSuit(id: string) {
    if (!ownedCosmetics.has(id)) return;
    setActiveSuit(id);
    AsyncStorage.setItem(ACTIVE_SUIT_KEY, id);
    hapticBuildComplete();
  }

  function handleActivateTheme(id: string) {
    if (!ownedCosmetics.has(id)) return;
    setActiveTheme(id);
    AsyncStorage.setItem(ACTIVE_THEME_KEY, id);
    hapticBuildComplete();
  }

  const credPacks      = PACKS.filter((p) => p.category === 'CREDITS');
  const spinPacks      = PACKS.filter((p) => p.category === 'SPINS');
  const resourcePacks  = PACKS.filter((p) => p.category === 'RESOURCE');
  const bundlePacks    = PACKS.filter((p) => p.category === 'BUNDLE');

  return (
    <SafeAreaView style={styles.root}>
      <LinearGradient
        colors={[Colors.credits + '22', Colors.primary + '11', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerGrad}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>STORE</Text>
            <Text style={styles.subtitle}>Watch · Buy · Collect</Text>
          </View>
          <View style={styles.creditsBadge}>
            <Text style={styles.creditsValue}>{credits.toLocaleString()}</Text>
            <Text style={styles.creditsLabel}> CR</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Rewarded ads */}
        <Text style={styles.sectionHeader}>FREE — WATCH AN AD</Text>
        <View style={styles.adsGrid}>
          {AD_REWARDS.map((ad) => {
            const readyAt = adReadyAt[ad.id] ?? 0;
            const ready = readyAt <= now;
            const cooldown = readyAt - now;
            return (
              <Pressable
                key={ad.id}
                onPress={() => handleAdTap(ad)}
                disabled={!ready}
                style={[styles.adCard, !ready && styles.adCardLocked]}
              >
                <Text style={[styles.adReward, !ready && { color: Colors.textMuted }]}>{ad.label}</Text>
                <Text style={[styles.adStatus, ready ? { color: Colors.success } : { color: Colors.textMuted }]}>
                  {ready ? '▶ WATCH' : `WAIT ${formatCooldown(cooldown)}`}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Credit packs */}
        <Text style={styles.sectionHeader}>CREDIT PACKS</Text>
        {credPacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} />)}

        {/* Spin packs */}
        <Text style={styles.sectionHeader}>INSTANT SPIN REFILL</Text>
        {spinPacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} />)}

        {/* Resource packs */}
        <Text style={styles.sectionHeader}>RESOURCES</Text>
        {resourcePacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} />)}

        {/* Bundles */}
        <Text style={styles.sectionHeader}>BUNDLES</Text>
        {bundlePacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} />)}

        {/* Cosmetics */}
        <Text style={styles.sectionHeader}>COSMETICS — SUIT COLOR</Text>
        <View style={styles.suitGrid}>
          {SUIT_OPTIONS.map((suit) => {
            const owned  = ownedCosmetics.has(suit.id);
            const active = activeSuit === suit.id;
            return (
              <Pressable
                key={suit.id}
                onPress={() => owned ? handleActivateSuit(suit.id) : handleCosmeticBuy(suit.id, suit.creditCost)}
                style={[styles.suitCard, active && { borderColor: suit.color, borderWidth: 2 }]}
              >
                <View style={[styles.suitSwatch, { backgroundColor: suit.color }]} />
                <Text style={styles.suitLabel}>{suit.label}</Text>
                {active ? (
                  <Text style={[styles.suitStatus, { color: suit.color }]}>ACTIVE</Text>
                ) : owned ? (
                  <Text style={[styles.suitStatus, { color: Colors.success }]}>OWNED</Text>
                ) : (
                  <Text style={styles.suitCost}>{suit.creditCost.toLocaleString()} CR</Text>
                )}
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionHeader}>COSMETICS — REEL THEME</Text>
        {THEME_OPTIONS.map((theme) => {
          const owned  = ownedCosmetics.has(theme.id);
          const active = activeTheme === theme.id;
          return (
            <Pressable
              key={theme.id}
              onPress={() => owned ? handleActivateTheme(theme.id) : handleCosmeticBuy(theme.id, theme.creditCost)}
              style={[styles.themeCard, active && styles.themeCardActive]}
            >
              <View style={styles.themeLeft}>
                <Text style={[styles.themeLabel, active && { color: Colors.accent }]}>{theme.label}</Text>
                <Text style={styles.themeDesc}>{theme.desc}</Text>
              </View>
              <View style={styles.themeRight}>
                {active ? (
                  <Text style={[styles.themeStatus, { color: Colors.accent }]}>ACTIVE</Text>
                ) : owned ? (
                  <Text style={[styles.themeStatus, { color: Colors.success }]}>OWNED</Text>
                ) : (
                  <Text style={styles.themeCost}>{theme.creditCost.toLocaleString()} CR</Text>
                )}
              </View>
            </Pressable>
          );
        })}

        <Text style={styles.footnote}>
          Purchases shown above are simulated for development. No real charge will occur. Real
          payment gateways are wired in at production launch.
        </Text>
      </ScrollView>

      {/* Ad watch modal */}
      <AdWatchModal
        visible={!!adActive}
        rewardLabel={adActive?.rewardLabel ?? ''}
        onClose={() => setAdActive(null)}
        onComplete={handleAdComplete}
      />

      {/* Purchase confirmation modal */}
      <Modal visible={!!pendingPack} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          {pendingPack && (
            <View style={styles.confirmPanel}>
              <Text style={styles.confirmTitle}>CONFIRM PURCHASE</Text>
              <Text style={styles.confirmLabel}>{pendingPack.label}</Text>
              <Text style={styles.confirmDesc}>{pendingPack.description}</Text>
              <Text style={styles.confirmPrice}>{pendingPack.price}</Text>
              <Text style={styles.confirmDisclaimer}>
                Simulated · no real charge
              </Text>
              <View style={styles.confirmRow}>
                <Pressable onPress={() => setPendingPack(null)} style={styles.confirmCancel}>
                  <Text style={styles.confirmCancelText}>CANCEL</Text>
                </Pressable>
                <Pressable onPress={confirmPurchase} style={styles.confirmAccept}>
                  <Text style={styles.confirmAcceptText}>BUY</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Toast */}
      {confirmation && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{confirmation}</Text>
        </View>
      )}

      <Pressable style={styles.legendBtn} onPress={() => setLegendVisible(true)} hitSlop={12}>
        <Text style={styles.legendBtnText}>?</Text>
      </Pressable>

      <LegendCard visible={legendVisible} onDismiss={() => setLegendVisible(false)} title="STORE LEGEND" accentColor={Colors.credits}>
        <LegendSection label="REWARDED ADS" />
        <LegendRow left="WATCH AD" right="Free reward · cooldown locked" color={Colors.success} />
        <LegendRow left="" right="No charge — sponsored by partners" />
        <LegendSection label="PACKS" />
        <LegendRow left="CREDITS"  right="Permanent CR top-up" color={Colors.credits} />
        <LegendRow left="REFILL"   right="Resets your spin meter to max" />
        <LegendRow left="RESOURCE" right="Top up FUEL / BOOST / SHIELDS" />
        <LegendRow left="BUNDLE"   right="Best value · multi-resource" color={Colors.primary} />
        <LegendNote text="All purchases are simulated during development. Real payment integration ships at launch." />
      </LegendCard>
    </SafeAreaView>
  );
}

function PackRow({ pack, onBuy }: { pack: StorePack; onBuy: (p: StorePack) => void }) {
  return (
    <Pressable onPress={() => onBuy(pack)} style={[styles.packCard, pack.featured && styles.packCardFeatured]}>
      <View style={styles.packLeft}>
        {pack.featured && <Text style={styles.packBadge}>★ BEST VALUE</Text>}
        <Text style={styles.packLabel}>{pack.label}</Text>
        <Text style={styles.packDesc}>{pack.description}</Text>
      </View>
      <View style={styles.packBuyCol}>
        <Text style={styles.packPrice}>{pack.price}</Text>
        <View style={[styles.buyChip, pack.featured && { borderColor: Colors.primary }]}>
          <Text style={[styles.buyChipText, pack.featured && { color: Colors.primary }]}>BUY</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
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
  creditsBadge: { flexDirection: 'row', alignItems: 'baseline' },
  creditsValue: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.credits,
  },
  creditsLabel: {
    fontSize: Typography.sizes.sm,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  scroll: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: Spacing.xxl },

  sectionHeader: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
    marginTop: Spacing.sm,
    marginBottom: 4,
  },

  adsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  adCard: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.success + '66',
    padding: Spacing.md,
    gap: 4,
  },
  adCardLocked: {
    borderColor: Colors.border,
    opacity: 0.6,
  },
  adReward: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 1,
  },
  adStatus: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },

  packCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.md,
    alignItems: 'center',
  },
  packCardFeatured: {
    borderColor: Colors.primary + '99',
    backgroundColor: Colors.surfaceElevated,
  },
  packLeft: { flex: 1, gap: 2 },
  packBadge: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    color: Colors.primary,
    letterSpacing: 2,
  },
  packLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  packDesc: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  packBuyCol: { alignItems: 'flex-end', gap: 4 },
  packPrice: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.credits,
    letterSpacing: 1,
  },
  buyChip: {
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  buyChipText: {
    fontSize: 10,
    fontWeight: Typography.weights.bold,
    color: Colors.textSecondary,
    letterSpacing: 2,
  },

  footnote: {
    fontSize: 10,
    color: Colors.textMuted,
    lineHeight: 16,
    marginTop: Spacing.md,
    fontStyle: 'italic',
  },

  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  confirmPanel: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.lg,
    gap: 4,
  },
  confirmTitle: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 3,
    textAlign: 'center',
  },
  confirmLabel: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: Spacing.sm,
  },
  confirmDesc: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    letterSpacing: 1,
    textAlign: 'center',
  },
  confirmPrice: {
    fontSize: Typography.sizes.xl,
    fontWeight: Typography.weights.bold,
    color: Colors.credits,
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: Spacing.md,
  },
  confirmDisclaimer: {
    fontSize: 10,
    color: Colors.textMuted,
    letterSpacing: 1,
    textAlign: 'center',
    marginTop: 4,
    fontStyle: 'italic',
  },
  confirmRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  confirmCancel: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  confirmCancelText: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 2,
  },
  confirmAccept: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
  },
  confirmAcceptText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.background,
    letterSpacing: 3,
  },

  toast: {
    position: 'absolute',
    bottom: 80,
    left: Spacing.md,
    right: Spacing.md,
    backgroundColor: Colors.surfaceElevated,
    borderColor: Colors.success,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    alignItems: 'center',
  },
  toastText: {
    fontSize: Typography.sizes.xs,
    color: Colors.success,
    letterSpacing: 2,
    fontWeight: Typography.weights.bold,
  },
  legendBtn: {
    position: 'absolute',
    top: 14,
    right: Spacing.md,
    width: 26, height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  legendBtnText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    color: Colors.textMuted,
  },

  suitGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  suitCard: {
    flexBasis: '18%',
    flexGrow: 1,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  suitSwatch: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
  },
  suitLabel: {
    fontSize: 9,
    color: Colors.textSecondary,
    letterSpacing: 1,
    textAlign: 'center',
  },
  suitStatus: {
    fontSize: 9,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
  suitCost: {
    fontSize: 9,
    color: Colors.credits,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },

  themeCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    alignItems: 'center',
  },
  themeCardActive: {
    borderColor: Colors.accent + '99',
    backgroundColor: Colors.surfaceElevated,
  },
  themeLeft: { flex: 1, gap: 2 },
  themeLabel: {
    fontSize: Typography.sizes.sm,
    fontWeight: Typography.weights.bold,
    color: Colors.textPrimary,
    letterSpacing: 2,
  },
  themeDesc: {
    fontSize: Typography.sizes.xs,
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  themeRight: { alignItems: 'flex-end' },
  themeStatus: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
  },
  themeCost: {
    fontSize: Typography.sizes.xs,
    color: Colors.credits,
    fontWeight: Typography.weights.bold,
    letterSpacing: 1,
  },
});
