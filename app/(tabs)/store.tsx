import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameStore } from '@/store/useGameStore';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
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
import {
  COSMETICS_CATALOG,
  CosmeticItem,
  CosmeticCategory,
} from '@/services/CosmeticsService';
import { Colors, Typography, Spacing, BorderRadius } from '@/constants/theme';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRewards(r: PackReward): string {
  const parts: string[] = [];
  if (r.spinRefill) parts.push('SPINS REFILLED');
  if (r.credits)   parts.push(`+${r.credits.toLocaleString()} CR`);
  if (r.fuel)      parts.push(`+${r.fuel} FUEL`);
  if (r.boost)     parts.push(`+${r.boost} BOOST`);
  if (r.shields)   parts.push(`+${r.shields} SHIELD`);
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

const CATEGORY_LABELS: Partial<Record<CosmeticCategory, string>> = {
  REEL_THEME:  'REEL THEMES',
  SYMBOL_PACK: 'SYMBOL PACKS',
  SUIT_COLOR:  'SUIT COLORS',
  EMBLEM:      'EMBLEMS',
  TITLE:       'PILOT TITLES',
  SPIN_BUTTON: 'SPIN BUTTON SKINS',
  BACKGROUND:  'AMBIENT BACKGROUNDS',
  HUD_SKIN:    'HUD SKINS',
  BUNDLE:      'BUNDLES & PASSES',
};

const CATEGORY_ORDER: CosmeticCategory[] = [
  'REEL_THEME', 'SYMBOL_PACK', 'SUIT_COLOR', 'EMBLEM', 'TITLE',
  'SPIN_BUTTON', 'BACKGROUND', 'HUD_SKIN', 'BUNDLE',
];

// ─── CosmeticCard ─────────────────────────────────────────────────────────────

function CosmeticCard({
  item,
  owned,
  active,
  onBuy,
  onEquip,
}: {
  item: CosmeticItem;
  owned: boolean;
  active: boolean;
  onBuy: (item: CosmeticItem) => void;
  onEquip: (item: CosmeticItem) => void;
}) {
  const accent = item.previewColor ?? Colors.primary;

  return (
    <View style={[styles.cosCard, active && { borderColor: accent, borderWidth: 2 }, item.featured && styles.cosCardFeatured]}>
      {item.featured && <Text style={[styles.cosCardBadge, { color: accent }]}>★</Text>}
      <View style={[styles.cosSwatchRow]}>
        <View style={[styles.cosSwatch, { backgroundColor: accent + '33', borderColor: accent + '88' }]}>
          <Text style={[styles.cosSwatchText, { color: accent }]}>{accent.slice(0, 2).toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.cosName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.cosDesc} numberOfLines={2}>{item.description}</Text>

      {active ? (
        <View style={[styles.cosActionChip, { backgroundColor: accent + '33', borderColor: accent }]}>
          <Text style={[styles.cosActionText, { color: accent }]}>ACTIVE</Text>
        </View>
      ) : owned ? (
        <Pressable onPress={() => onEquip(item)} style={[styles.cosActionChip, styles.cosEquipChip]}>
          <Text style={styles.cosActionText}>EQUIP</Text>
        </Pressable>
      ) : item.creditCost > 0 ? (
        <Pressable onPress={() => onBuy(item)} style={styles.cosActionChip}>
          <Text style={styles.cosActionText}>{item.creditCost.toLocaleString()} CR</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => onBuy(item)} style={[styles.cosActionChip, styles.cosIapChip]}>
          <Text style={[styles.cosActionText, { color: Colors.credits }]}>{item.iapPrice}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── PackRow ──────────────────────────────────────────────────────────────────

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

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function StoreScreen() {
  const { grantResources, subtractCredits, credits } = useGameStore();
  const { buy: buyCosmetic, equip: equipCosmetic, isOwned, getActive, load: loadCosmetics } = useCosmeticsStore();

  const [adReadyAt, setAdReadyAt] = useState<Record<string, number>>({});
  const [now, setNow]             = useState(Date.now());
  const [adActive, setAdActive]   = useState<AdReward | null>(null);
  const [pendingPack, setPendingPack] = useState<StorePack | null>(null);
  const [pendingCosmetic, setPendingCosmetic] = useState<CosmeticItem | null>(null);
  const [toast, setToast]         = useState<string | null>(null);
  const [legendVisible, setLegendVisible] = useState(false);

  useEffect(() => {
    loadCosmetics();
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    Promise.all(AD_REWARDS.map(async (a) => [a.id, await getAdReadyAt(a.id)] as const))
      .then((entries) => {
        const map: Record<string, number> = {};
        entries.forEach(([id, ts]) => { map[id] = ts; });
        setAdReadyAt(map);
      });
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  // ── Ad handlers ──
  function handleAdTap(ad: AdReward) {
    if ((adReadyAt[ad.id] ?? 0) > now) return;
    setAdActive(ad);
  }

  function handleAdComplete() {
    if (!adActive) return;
    grantResources(adActive.reward);
    markAdClaimed(adActive.id, adActive.cooldownMs);
    setAdReadyAt((prev) => ({ ...prev, [adActive.id]: Date.now() + adActive.cooldownMs }));
    showToast(`Reward claimed: ${adActive.rewardLabel}`);
    setAdActive(null);
  }

  // ── IAP pack handlers ──
  function handlePurchase(pack: StorePack) { setPendingPack(pack); }

  function confirmPurchase() {
    if (!pendingPack) return;
    grantResources(pendingPack.rewards);
    hapticBuildComplete();
    showToast(`Purchased: ${pendingPack.label} — ${formatRewards(pendingPack.rewards)}`);
    setPendingPack(null);
  }

  // ── Cosmetic handlers ──
  function handleCosmeticBuy(item: CosmeticItem) {
    if (item.creditCost < 0) {
      // IAP — show confirmation modal
      setPendingCosmetic(item);
      return;
    }
    const result = buyCosmetic(item.id);
    if (result === 'ok') {
      hapticActivateBuff();
      equipCosmetic(item.id);
      showToast(`Unlocked & equipped: ${item.name}`);
    } else if (result === 'insufficient_credits') {
      showToast(`Need ${item.creditCost.toLocaleString()} CR — keep spinning!`);
    } else if (result === 'already_owned') {
      equipCosmetic(item.id);
      showToast(`Equipped: ${item.name}`);
    }
  }

  function handleCosmeticEquip(item: CosmeticItem) {
    equipCosmetic(item.id);
    hapticBuildComplete();
    showToast(`Equipped: ${item.name}`);
  }

  function confirmCosmeticIap() {
    if (!pendingCosmetic) return;
    const result = buyCosmetic(pendingCosmetic.id);
    // IAP-only items: buy() returns 'iap_required', so we grant directly (simulated)
    const next = useCosmeticsStore.getState();
    const owned = new Set(next.owned);
    owned.add(pendingCosmetic.id);
    useCosmeticsStore.setState({ owned });
    equipCosmetic(pendingCosmetic.id);
    hapticBuildComplete();
    showToast(`Purchased: ${pendingCosmetic.name}`);
    setPendingCosmetic(null);
    void result;
  }

  // Catalog split by category
  const catalogByCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat] ?? cat,
    items: COSMETICS_CATALOG.filter((c) => c.category === cat),
  })).filter((g) => g.items.length > 0);

  const credPacks     = PACKS.filter((p) => p.category === 'CREDITS');
  const spinPacks     = PACKS.filter((p) => p.category === 'SPINS');
  const resourcePacks = PACKS.filter((p) => p.category === 'RESOURCE');
  const bundlePacks   = PACKS.filter((p) => p.category === 'BUNDLE');

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
            return (
              <Pressable
                key={ad.id}
                onPress={() => handleAdTap(ad)}
                disabled={!ready}
                style={[styles.adCard, !ready && styles.adCardLocked]}
              >
                <Text style={[styles.adReward, !ready && { color: Colors.textMuted }]}>{ad.label}</Text>
                <Text style={[styles.adStatus, { color: ready ? Colors.success : Colors.textMuted }]}>
                  {ready ? '▶ WATCH' : `WAIT ${formatCooldown(readyAt - now)}`}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* IAP Resource packs */}
        <Text style={styles.sectionHeader}>CREDIT PACKS</Text>
        {credPacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} />)}

        <Text style={styles.sectionHeader}>INSTANT SPIN REFILL</Text>
        {spinPacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} />)}

        <Text style={styles.sectionHeader}>RESOURCES</Text>
        {resourcePacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} />)}

        <Text style={styles.sectionHeader}>BUNDLES</Text>
        {bundlePacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} />)}

        {/* ── COSMETICS ── */}
        {catalogByCategory.map(({ category, label, items }) => (
          <View key={category}>
            <Text style={styles.cosSection}>{label}</Text>
            <FlatList
              data={items}
              horizontal
              keyExtractor={(item) => item.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cosRow}
              renderItem={({ item }) => (
                <CosmeticCard
                  item={item}
                  owned={isOwned(item.id)}
                  active={getActive(item.category) === item.id}
                  onBuy={handleCosmeticBuy}
                  onEquip={handleCosmeticEquip}
                />
              )}
            />
          </View>
        ))}

        <Text style={styles.footnote}>
          CR purchases are earned in-game. Items marked with a price are simulated IAP during
          development — no real charge occurs. Real payment integration ships at launch.
        </Text>
      </ScrollView>

      {/* Ad watch modal */}
      <AdWatchModal
        visible={!!adActive}
        rewardLabel={adActive?.rewardLabel ?? ''}
        onClose={() => setAdActive(null)}
        onComplete={handleAdComplete}
      />

      {/* IAP Pack confirmation modal */}
      <Modal visible={!!pendingPack} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          {pendingPack && (
            <View style={styles.confirmPanel}>
              <Text style={styles.confirmTitle}>CONFIRM PURCHASE</Text>
              <Text style={styles.confirmLabel}>{pendingPack.label}</Text>
              <Text style={styles.confirmDesc}>{pendingPack.description}</Text>
              <Text style={styles.confirmPrice}>{pendingPack.price}</Text>
              <Text style={styles.confirmDisclaimer}>Simulated · no real charge</Text>
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

      {/* IAP Cosmetic confirmation modal */}
      <Modal visible={!!pendingCosmetic} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          {pendingCosmetic && (
            <View style={styles.confirmPanel}>
              <Text style={styles.confirmTitle}>UNLOCK COSMETIC</Text>
              <Text style={styles.confirmLabel}>{pendingCosmetic.name}</Text>
              <Text style={styles.confirmDesc}>{pendingCosmetic.description}</Text>
              <Text style={styles.confirmPrice}>{pendingCosmetic.iapPrice}</Text>
              <Text style={styles.confirmDisclaimer}>Simulated · no real charge</Text>
              <View style={styles.confirmRow}>
                <Pressable onPress={() => setPendingCosmetic(null)} style={styles.confirmCancel}>
                  <Text style={styles.confirmCancelText}>CANCEL</Text>
                </Pressable>
                <Pressable onPress={confirmCosmeticIap} style={[styles.confirmAccept, { backgroundColor: Colors.accent }]}>
                  <Text style={styles.confirmAcceptText}>UNLOCK</Text>
                </Pressable>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Toast */}
      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Pressable style={styles.legendBtn} onPress={() => setLegendVisible(true)} hitSlop={12}>
        <Text style={styles.legendBtnText}>?</Text>
      </Pressable>

      <LegendCard visible={legendVisible} onDismiss={() => setLegendVisible(false)} title="STORE LEGEND" accentColor={Colors.credits}>
        <LegendSection label="REWARDED ADS" />
        <LegendRow left="WATCH AD" right="Free reward · cooldown locked" color={Colors.success} />
        <LegendSection label="PACKS" />
        <LegendRow left="CREDITS"  right="Permanent CR top-up" color={Colors.credits} />
        <LegendRow left="REFILL"   right="Resets spin meter to max" />
        <LegendRow left="RESOURCE" right="Top up FUEL / BOOST / SHIELDS" />
        <LegendSection label="COSMETICS" />
        <LegendRow left="CR cost"  right="Buy with earned credits — no paywall" color={Colors.success} />
        <LegendRow left="$ price"  right="Premium IAP — exclusive items" color={Colors.credits} />
        <LegendRow left="EQUIP"    right="Tap to activate an owned cosmetic" />
        <LegendNote text="All cosmetics are visual only. Nothing changes your odds or combat math." />
      </LegendCard>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  headerGrad: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  headerRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title:      { fontSize: Typography.sizes.xxl, fontWeight: Typography.weights.bold, color: Colors.textPrimary, letterSpacing: 6 },
  subtitle:   { fontSize: Typography.sizes.sm, color: Colors.textMuted, letterSpacing: 2, marginTop: 2 },
  creditsBadge: { flexDirection: 'row', alignItems: 'baseline' },
  creditsValue: { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: Colors.credits },
  creditsLabel: { fontSize: Typography.sizes.sm, color: Colors.textMuted, letterSpacing: 2 },

  scroll: { padding: Spacing.md, gap: Spacing.sm, paddingBottom: 100 },

  sectionHeader: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 3, marginTop: Spacing.sm, marginBottom: 4 },

  adsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  adCard:       { flexBasis: '48%', flexGrow: 1, backgroundColor: Colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.success + '66', padding: Spacing.md, gap: 4 },
  adCardLocked: { borderColor: Colors.border, opacity: 0.6 },
  adReward:     { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, color: Colors.textPrimary, letterSpacing: 1 },
  adStatus:     { fontSize: 10, fontWeight: Typography.weights.bold, letterSpacing: 2 },

  packCard:         { flexDirection: 'row', backgroundColor: Colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.border, padding: Spacing.md, gap: Spacing.md, alignItems: 'center' },
  packCardFeatured: { borderColor: Colors.primary + '99', backgroundColor: Colors.surfaceElevated },
  packLeft:         { flex: 1, gap: 2 },
  packBadge:        { fontSize: 9, fontWeight: Typography.weights.bold, color: Colors.primary, letterSpacing: 2 },
  packLabel:        { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, color: Colors.textPrimary, letterSpacing: 2 },
  packDesc:         { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 1 },
  packBuyCol:       { alignItems: 'flex-end', gap: 4 },
  packPrice:        { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, color: Colors.credits, letterSpacing: 1 },
  buyChip:          { borderWidth: 1, borderColor: Colors.border, paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.sm },
  buyChipText:      { fontSize: 10, fontWeight: Typography.weights.bold, color: Colors.textSecondary, letterSpacing: 2 },

  // Cosmetic section
  cosSection: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 3, marginTop: Spacing.md, marginBottom: Spacing.sm },
  cosRow:     { paddingRight: Spacing.md, gap: Spacing.sm },
  cosCard:    {
    width: 130,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    gap: 4,
  },
  cosCardFeatured: { backgroundColor: Colors.surfaceElevated },
  cosCardBadge:    { fontSize: 9, letterSpacing: 1, textAlign: 'right' },
  cosSwatchRow:    { alignItems: 'center', paddingVertical: 4 },
  cosSwatch:       { width: 40, height: 40, borderRadius: BorderRadius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cosSwatchText:   { fontSize: 10, fontWeight: Typography.weights.bold, letterSpacing: 1 },
  cosName:         { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, color: Colors.textPrimary, letterSpacing: 1 },
  cosDesc:         { fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5, lineHeight: 14 },
  cosActionChip:   { marginTop: 2, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, paddingVertical: 4, alignItems: 'center' },
  cosEquipChip:    { borderColor: Colors.success + '88' },
  cosIapChip:      { borderColor: Colors.credits + '88' },
  cosActionText:   { fontSize: 9, fontWeight: Typography.weights.bold, color: Colors.textSecondary, letterSpacing: 2 },

  footnote: { fontSize: 10, color: Colors.textMuted, lineHeight: 16, marginTop: Spacing.md, fontStyle: 'italic' },

  confirmOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
  confirmPanel:      { width: '100%', maxWidth: 320, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, gap: 4 },
  confirmTitle:      { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 3, textAlign: 'center' },
  confirmLabel:      { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: Colors.textPrimary, letterSpacing: 2, textAlign: 'center', marginTop: Spacing.sm },
  confirmDesc:       { fontSize: Typography.sizes.sm, color: Colors.textSecondary, letterSpacing: 1, textAlign: 'center' },
  confirmPrice:      { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: Colors.credits, letterSpacing: 2, textAlign: 'center', marginTop: Spacing.md },
  confirmDisclaimer: { fontSize: 10, color: Colors.textMuted, letterSpacing: 1, textAlign: 'center', marginTop: 4, fontStyle: 'italic' },
  confirmRow:        { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  confirmCancel:     { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  confirmCancelText: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 2 },
  confirmAccept:     { flex: 1, backgroundColor: Colors.primary, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  confirmAcceptText: { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, color: Colors.background, letterSpacing: 3 },

  toast:     { position: 'absolute', bottom: 80, left: Spacing.md, right: Spacing.md, backgroundColor: Colors.surfaceElevated, borderColor: Colors.success, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center' },
  toastText: { fontSize: Typography.sizes.xs, color: Colors.success, letterSpacing: 2, fontWeight: Typography.weights.bold },

  legendBtn:     { position: 'absolute', top: 14, right: Spacing.md, width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center', zIndex: 50 },
  legendBtnText: { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, color: Colors.textMuted },
});
