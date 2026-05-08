import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, Pressable, Modal, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useGameStore } from '@/store/useGameStore';
import { useCosmeticsStore } from '@/store/useCosmeticsStore';
import { LegendCard, LegendSection, LegendRow, LegendNote } from '@/components/LegendCard';
import { IconButton } from '@/components/IconButton';
import { TopBar } from '@/components/TopBar';
import { AdWatchModal } from '@/components/AdWatchModal';
import { adsService, ADS_AVAILABLE } from '@/services/AdsService';
import { iapService } from '@/services/IapService';
import { useIapPrices } from '@/hooks/useIapPrices';
import { CosmeticPreview } from '@/components/CosmeticPreview';
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

function pickRandom<T>(n: number, arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, n);
}

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

const CATEGORY_DESCRIPTIONS: Partial<Record<CosmeticCategory, string>> = {
  REEL_THEME:  'Reskins the slot reel track — background color, cell tints, and border glow.',
  SYMBOL_PACK: 'Replaces all 9 slot symbols with a themed icon set. Odds are never affected.',
  SUIT_COLOR:  'Swaps your pilot suit artwork — body silhouette across every screen.',
  HELMET:      'Overlays a helmet on the pilot avatar — visible on Pilot, Spin HUD, and RADAR.',
  FRAME:       'Frames the avatar with a decorative ring shown on Pilot and resource bars.',
  NAMEPLATE:   'Background banner behind your pilot name on Pilot and RADAR cards.',
  ACCESSORY:   'Small badge, pin, or scarf overlay layered on the pilot avatar.',
  EMBLEM:      'Adds a small icon badge next to your pilot name in the resource bar and RADAR.',
  TITLE:       'Prefixes your pilot name (e.g. "COMMANDER ASHTON") — shown in HUD and on RADAR.',
  SPIN_BUTTON: 'Changes the spin button shape, glow color, and border animation.',
  BACKGROUND:  'Sets the animated ambient background visible behind the reels on the Spin screen.',
  HUD_SKIN:    'Reskins the top resource bar showing credits, fuel, and spins.',
  BUNDLE:      'A curated bundle combining cosmetics and/or bonus resources at a reduced price.',
};

const CATEGORY_LABELS: Partial<Record<CosmeticCategory, string>> = {
  REEL_THEME:  'REEL THEMES',
  SYMBOL_PACK: 'SYMBOL PACKS',
  SUIT_COLOR:  'PILOT SUITS',
  HELMET:      'HELMETS',
  FRAME:       'AVATAR FRAMES',
  NAMEPLATE:   'NAMEPLATES',
  ACCESSORY:   'ACCESSORIES',
  EMBLEM:      'EMBLEMS',
  TITLE:       'PILOT TITLES',
  SPIN_BUTTON: 'SPIN BUTTON SKINS',
  BACKGROUND:  'AMBIENT BACKGROUNDS',
  HUD_SKIN:    'HUD SKINS',
  BUNDLE:      'BUNDLES & PASSES',
};

const CATEGORY_ORDER: CosmeticCategory[] = [
  'REEL_THEME', 'SYMBOL_PACK', 'SUIT_COLOR', 'HELMET', 'FRAME',
  'NAMEPLATE', 'ACCESSORY', 'EMBLEM', 'TITLE',
  'SPIN_BUTTON', 'BACKGROUND', 'HUD_SKIN', 'BUNDLE',
];

// ─── CosmeticCard ─────────────────────────────────────────────────────────────

function CosmeticCard({
  item,
  owned,
  active,
  onPress,
  livePrice,
}: {
  item: CosmeticItem;
  owned: boolean;
  active: boolean;
  onPress: (item: CosmeticItem) => void;
  livePrice?: string;
}) {
  const accent = item.previewColor ?? Colors.primary;

  let chipLabel: string;
  let chipExtraStyle: object = {};
  let chipTextColor: string = Colors.textSecondary;
  if (active) {
    chipExtraStyle = { backgroundColor: accent + '33', borderColor: accent };
    chipTextColor = accent;
    chipLabel = 'ACTIVE';
  } else if (owned) {
    chipExtraStyle = { borderColor: Colors.success + '88' };
    chipLabel = 'OWNED';
  } else if (item.creditCost > 0) {
    chipLabel = `${item.creditCost.toLocaleString()} CR`;
  } else {
    chipExtraStyle = { borderColor: Colors.credits + '88' };
    chipTextColor = Colors.credits;
    chipLabel = livePrice ?? item.iapPrice ?? '';
  }

  return (
    <Pressable
      onPress={() => onPress(item)}
      style={[styles.cosCard, active && { borderColor: accent, borderWidth: 2 }, item.featured && styles.cosCardFeatured]}
    >
      {item.featured && <Text style={[styles.cosCardBadge, { color: accent }]}>★</Text>}
      <View style={styles.cosSwatchRow}>
        <CosmeticPreview category={item.category} itemId={item.id} accentColor={accent} />
      </View>
      <Text style={styles.cosName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.cosDesc} numberOfLines={2}>{item.description}</Text>
      <View style={[styles.cosActionChip, chipExtraStyle]}>
        <Text style={[styles.cosActionText, { color: chipTextColor }]}>{chipLabel}</Text>
      </View>
    </Pressable>
  );
}

// ─── PackRow ──────────────────────────────────────────────────────────────────

function PackRow({ pack, onBuy, livePrice }: { pack: StorePack; onBuy: (p: StorePack) => void; livePrice?: string }) {
  return (
    <Pressable onPress={() => onBuy(pack)} style={[styles.packCard, pack.featured && styles.packCardFeatured]}>
      <View style={styles.packLeft}>
        {pack.featured && <Text style={styles.packBadge}>★ BEST VALUE</Text>}
        <Text style={styles.packLabel}>{pack.label}</Text>
        <Text style={styles.packDesc}>{pack.description}</Text>
      </View>
      <View style={styles.packBuyCol}>
        <Text style={styles.packPrice}>{livePrice ?? pack.price}</Text>
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
  const { buy: buyCosmetic, equip: equipCosmetic, unequip: unequipCosmetic, isOwned, getActive, load: loadCosmetics } = useCosmeticsStore();

  const [adSlots, setAdSlots]     = useState<AdReward[]>(() => pickRandom(2, AD_REWARDS));
  const [adReadyAt, setAdReadyAt] = useState<Record<string, number>>({});
  const [now, setNow]             = useState(Date.now());
  const [adActive, setAdActive]   = useState<AdReward | null>(null);
  const [pendingPack, setPendingPack] = useState<StorePack | null>(null);
  const [pendingCosmetic, setPendingCosmetic] = useState<CosmeticItem | null>(null);
  const [cosmeticDetail, setCosmeticDetail] = useState<CosmeticItem | null>(null);
  const [toast, setToast]         = useState<string | null>(null);
  const [legendVisible, setLegendVisible] = useState(false);

  // Live RevenueCat prices for everything that has a baked-in iapPrice or PACKS price.
  // Falls back to the catalog string when RC isn't configured (Expo Go / no keys).
  const iapIds = useMemo(() => {
    const packIds = PACKS.map((p) => p.id);
    const cosmeticIds = COSMETICS_CATALOG
      .filter((c) => !!c.iapPrice)
      .map((c) => c.id);
    return [...packIds, ...cosmeticIds];
  }, []);
  const livePrices = useIapPrices(iapIds);

  const detailAccent   = cosmeticDetail?.previewColor ?? Colors.primary;
  const detailIsOwned  = cosmeticDetail ? isOwned(cosmeticDetail.id) : false;
  const detailIsActive = cosmeticDetail ? getActive(cosmeticDetail.category) === cosmeticDetail.id : false;

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
  function grantAdReward(ad: AdReward) {
    grantResources(ad.reward);
    markAdClaimed(ad.id, ad.cooldownMs);
    setAdReadyAt((prev) => ({ ...prev, [ad.id]: Date.now() + ad.cooldownMs }));
    showToast(`Reward claimed: ${ad.rewardLabel}`);
  }

  async function handleAdTap(ad: AdReward) {
    if ((adReadyAt[ad.id] ?? 0) > now) return;
    if (!ADS_AVAILABLE) {
      // Expo Go / stub mode — keep the fake-ad modal flow
      setAdActive(ad);
      return;
    }
    const { rewarded } = await adsService.showRewardedAd();
    if (rewarded) grantAdReward(ad);
  }

  function handleAdComplete() {
    if (!adActive) return;
    grantAdReward(adActive);
    setAdActive(null);
  }

  // ── IAP pack handlers ──
  function handlePurchase(pack: StorePack) { setPendingPack(pack); }

  async function confirmPurchase() {
    if (!pendingPack) return;
    const pack = pendingPack;
    setPendingPack(null);
    const r = await iapService.purchase(pack.id);
    if (!r.ok) {
      if (r.error && r.error !== 'cancelled') {
        showToast(`Purchase failed — ${r.error}`);
      }
      return;
    }
    // Stub mode (Expo Go / no RC keys) — apply rewards client-side so the
    // dev flow still works. Real receipts are validated + granted server-side
    // by the RevenueCat webhook (see MONETIZATION_CHECKLIST.md).
    if (r.stubbed) grantResources(pack.rewards);
    hapticBuildComplete();
    showToast(`Purchased: ${pack.label} — ${formatRewards(pack.rewards)}`);
  }

  async function handleManagePurchases() {
    // Customer Center is RC's prebuilt UI for restore + refund + manage subs.
    // It's the modern Apple-approved equivalent of a hand-rolled Restore
    // button — fall back to plain restore() when the UI package isn't loaded
    // (Expo Go or pre-`npm install` builds).
    const cc = await iapService.presentCustomerCenter();
    if (cc.shown) return;

    const r = await iapService.restore();
    if (r.stubbed) {
      showToast('Customer Center requires a production build');
      return;
    }
    showToast(
      r.restoredProductIds.length > 0
        ? `Restored ${r.restoredProductIds.length} purchase${r.restoredProductIds.length === 1 ? '' : 's'}`
        : 'No previous purchases found',
    );
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

  const stardustPacks = PACKS.filter((p) => p.category === 'STARDUST');
  const credPacks     = PACKS.filter((p) => p.category === 'CREDITS');
  const spinPacks     = PACKS.filter((p) => p.category === 'SPINS');
  const resourcePacks = PACKS.filter((p) => p.category === 'RESOURCE');
  const bundlePacks   = PACKS.filter((p) => p.category === 'BUNDLE');

  return (
    <SafeAreaView style={styles.root}>
      <TopBar
        right={<IconButton glyph="?" onPress={() => setLegendVisible(true)} />}
      />
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

        {/* 1. Rewarded ads — 2 random with refresh */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionHeader}>FREE — WATCH AN AD</Text>
          <Pressable onPress={() => setAdSlots(pickRandom(2, AD_REWARDS))} hitSlop={8}>
            <Text style={styles.refreshBtn}>↻</Text>
          </Pressable>
        </View>
        <View style={styles.adsGrid}>
          {adSlots.map((ad) => {
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

        {/* 2. Cosmetic bundles */}
        {catalogByCategory.filter((g) => g.category === 'BUNDLE').map(({ category, label, items }) => (
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
                  onPress={setCosmeticDetail}
                  livePrice={livePrices[item.id]}
                />
              )}
            />
          </View>
        ))}

        {/* 3. Cosmetic categories */}
        {catalogByCategory.filter((g) => g.category !== 'BUNDLE').map(({ category, label, items }) => (
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
                  onPress={setCosmeticDetail}
                  livePrice={livePrices[item.id]}
                />
              )}
            />
          </View>
        ))}

        {/* 4. Credit packs */}
        <Text style={styles.sectionHeader}>✦ STARDUST</Text>
        {stardustPacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} livePrice={livePrices[p.id]} />)}

        <Text style={styles.sectionHeader}>CREDIT PACKS</Text>
        {credPacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} livePrice={livePrices[p.id]} />)}

        {/* 5. Instant spin refill */}
        <Text style={styles.sectionHeader}>INSTANT SPIN REFILL</Text>
        {spinPacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} livePrice={livePrices[p.id]} />)}

        {/* 6. Resource packs */}
        <Text style={styles.sectionHeader}>RESOURCES</Text>
        {resourcePacks.map((p) => <PackRow key={p.id} pack={p} onBuy={handlePurchase} livePrice={livePrices[p.id]} />)}

        <Pressable onPress={handleManagePurchases} style={styles.restoreBtn}>
          <Text style={styles.restoreBtnText}>MANAGE PURCHASES</Text>
        </Pressable>

        <Text style={styles.footnote}>
          CR purchases are earned in-game. IAP receipts are validated server-side via RevenueCat
          before credits are granted. In dev / Expo Go the flow is stubbed — no real charge occurs.
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
              <View style={styles.packDetailBox}>
                {pendingPack.rewards.credits && (
                  <View style={styles.packDetailLine}>
                    <Text style={[styles.packDetailIcon, { color: Colors.credits }]}>★</Text>
                    <Text style={styles.packDetailText}>+{pendingPack.rewards.credits.toLocaleString()} Credits</Text>
                  </View>
                )}
                {pendingPack.rewards.spinRefill && (
                  <View style={styles.packDetailLine}>
                    <Text style={[styles.packDetailIcon, { color: Colors.primary }]}>↺</Text>
                    <Text style={styles.packDetailText}>Spin meter refilled to maximum</Text>
                  </View>
                )}
                {pendingPack.rewards.fuel && (
                  <View style={styles.packDetailLine}>
                    <Text style={[styles.packDetailIcon, { color: Colors.attack }]}>⚡</Text>
                    <Text style={styles.packDetailText}>+{pendingPack.rewards.fuel} Fuel Cell{pendingPack.rewards.fuel !== 1 ? 's' : ''} · each = 1 OVERCLOCK charge</Text>
                  </View>
                )}
                {pendingPack.rewards.boost && (
                  <View style={styles.packDetailLine}>
                    <Text style={[styles.packDetailIcon, { color: Colors.raid }]}>◈</Text>
                    <Text style={styles.packDetailText}>+{pendingPack.rewards.boost} Signal Booster{pendingPack.rewards.boost !== 1 ? 's' : ''} · ×1.5 credit weights for 1 spin</Text>
                  </View>
                )}
                {pendingPack.rewards.shields && (
                  <View style={styles.packDetailLine}>
                    <Text style={[styles.packDetailIcon, { color: Colors.shield }]}>◎</Text>
                    <Text style={styles.packDetailText}>+{pendingPack.rewards.shields} Shield{pendingPack.rewards.shields !== 1 ? 's' : ''} · blocks 1 incoming attack each</Text>
                  </View>
                )}
              </View>
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
              <Text style={styles.confirmPrice}>{livePrices[pendingCosmetic.id] ?? pendingCosmetic.iapPrice}</Text>
              <Text style={styles.confirmDisclaimer}>RevenueCat · receipt validated server-side</Text>
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

      {/* Cosmetic detail modal */}
      <Modal visible={!!cosmeticDetail} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setCosmeticDetail(null)}>
        <Pressable style={styles.detailOverlay} onPress={() => setCosmeticDetail(null)}>
          <Pressable style={styles.detailPanel} onPress={() => {}}>
            <View style={styles.detailDragBar} />
            {cosmeticDetail && (
              <>
                <Text style={styles.detailCategory}>{CATEGORY_LABELS[cosmeticDetail.category] ?? cosmeticDetail.category}</Text>
                <View style={[styles.detailSwatchWrap, { borderColor: detailAccent + '66' }]}>
                  <Text style={[styles.detailSwatchGlyph, { color: detailAccent }]}>
                    {cosmeticDetail.name.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.detailName}>{cosmeticDetail.name}</Text>
                <Text style={styles.detailDesc}>{cosmeticDetail.description}</Text>
                {CATEGORY_DESCRIPTIONS[cosmeticDetail.category] && (
                  <View style={[styles.detailEffectBox, { borderColor: detailAccent + '44' }]}>
                    <Text style={styles.detailEffectLabel}>CHANGES</Text>
                    <Text style={styles.detailEffectText}>{CATEGORY_DESCRIPTIONS[cosmeticDetail.category]}</Text>
                  </View>
                )}
                {cosmeticDetail.featured && (
                  <Text style={[styles.detailFeaturedBadge, { color: detailAccent }]}>★ FEATURED ITEM</Text>
                )}
                <View style={styles.detailActions}>
                  <Pressable onPress={() => setCosmeticDetail(null)} style={styles.detailClose}>
                    <Text style={styles.detailCloseText}>CLOSE</Text>
                  </Pressable>
                  {detailIsActive ? (
                    <Pressable
                      style={[styles.detailBuyBtn, { backgroundColor: Colors.surfaceElevated, borderWidth: 1, borderColor: detailAccent }]}
                      onPress={() => {
                        unequipCosmetic(cosmeticDetail.category);
                        hapticActivateBuff();
                        showToast(`Unequipped: ${cosmeticDetail.name} — base skin restored`);
                        setCosmeticDetail(null);
                      }}
                    >
                      <Text style={[styles.detailBuyText, { color: detailAccent }]}>UNEQUIP</Text>
                    </Pressable>
                  ) : detailIsOwned ? (
                    <Pressable
                      style={[styles.detailBuyBtn, { backgroundColor: detailAccent }]}
                      onPress={() => { handleCosmeticEquip(cosmeticDetail); setCosmeticDetail(null); }}
                    >
                      <Text style={styles.detailBuyText}>EQUIP</Text>
                    </Pressable>
                  ) : cosmeticDetail.creditCost > 0 ? (
                    <Pressable
                      style={[styles.detailBuyBtn, { backgroundColor: Colors.credits }]}
                      onPress={() => { setCosmeticDetail(null); handleCosmeticBuy(cosmeticDetail); }}
                    >
                      <Text style={styles.detailBuyText}>BUY — {cosmeticDetail.creditCost.toLocaleString()} CR</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      style={[styles.detailBuyBtn, { backgroundColor: Colors.accent }]}
                      onPress={() => { setCosmeticDetail(null); handleCosmeticBuy(cosmeticDetail); }}
                    >
                      <Text style={styles.detailBuyText}>UNLOCK — {livePrices[cosmeticDetail.id] ?? cosmeticDetail.iapPrice}</Text>
                    </Pressable>
                  )}
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toast */}
      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

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
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.sm, marginBottom: 4 },
  refreshBtn: { fontSize: Typography.sizes.md, color: Colors.textMuted },

  adsGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  adCard:       { flexBasis: '48%', flexGrow: 1, minHeight: 84, backgroundColor: Colors.surface, borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.success + '66', padding: Spacing.md, gap: 4, justifyContent: 'space-between' },
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
    width: 110,
    height: 180,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.sm,
    gap: 4,
    alignItems: 'center',
  },
  cosCardFeatured: { backgroundColor: Colors.surfaceElevated },
  cosCardBadge:    { fontSize: 9, letterSpacing: 1, textAlign: 'right' },
  cosSwatchRow:    { alignItems: 'center', paddingVertical: 4 },
  cosSwatch:       { width: 40, height: 40, borderRadius: BorderRadius.full, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  cosSwatchText:   { fontSize: 10, fontWeight: Typography.weights.bold, letterSpacing: 1 },
  cosName:         { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, color: Colors.textPrimary, letterSpacing: 1 },
  cosDesc:         { fontSize: 10, color: Colors.textMuted, letterSpacing: 0.5, lineHeight: 14 },
  cosActionChip:   { marginTop: 'auto', alignSelf: 'stretch', borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, paddingVertical: 4, alignItems: 'center' },
  cosEquipChip:    { borderColor: Colors.success + '88' },
  cosIapChip:      { borderColor: Colors.credits + '88' },
  cosActionText:   { fontSize: 9, fontWeight: Typography.weights.bold, color: Colors.textSecondary, letterSpacing: 2 },

  footnote: { fontSize: 10, color: Colors.textMuted, lineHeight: 16, marginTop: Spacing.md, fontStyle: 'italic' },
  restoreBtn: {
    alignSelf: 'center',
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
  },
  restoreBtnText: {
    fontSize: Typography.sizes.xs,
    fontWeight: Typography.weights.bold,
    letterSpacing: 2,
    color: Colors.textSecondary,
  },

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

  packDetailBox:  { gap: 6, marginVertical: Spacing.sm, paddingVertical: Spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: Colors.border },
  packDetailLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  packDetailIcon: { fontSize: Typography.sizes.sm, fontWeight: Typography.weights.bold, width: 18, textAlign: 'center' },
  packDetailText: { flex: 1, fontSize: Typography.sizes.xs, color: Colors.textSecondary, letterSpacing: 0.5, lineHeight: 18 },

  detailOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  detailPanel:     { backgroundColor: Colors.surface, borderTopLeftRadius: BorderRadius.lg, borderTopRightRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.border, padding: Spacing.lg, paddingBottom: Spacing.xl, gap: Spacing.sm },
  detailDragBar:   { width: 36, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: Spacing.sm },
  detailCategory:  { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 4, textAlign: 'center' },
  detailSwatchWrap: { alignSelf: 'center', width: 72, height: 72, borderRadius: BorderRadius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.surfaceElevated, marginVertical: Spacing.sm },
  detailSwatchGlyph: { fontSize: Typography.sizes.xxl, fontWeight: Typography.weights.bold, letterSpacing: 2 },
  detailName:      { fontSize: Typography.sizes.xl, fontWeight: Typography.weights.bold, color: Colors.textPrimary, letterSpacing: 2, textAlign: 'center' },
  detailDesc:      { fontSize: Typography.sizes.sm, color: Colors.textSecondary, letterSpacing: 0.5, textAlign: 'center', lineHeight: 20 },
  detailEffectBox: { borderWidth: 1, borderRadius: BorderRadius.sm, padding: Spacing.sm, gap: 4, marginTop: 4 },
  detailEffectLabel: { fontSize: 9, color: Colors.textMuted, letterSpacing: 3 },
  detailEffectText:  { fontSize: Typography.sizes.xs, color: Colors.textSecondary, letterSpacing: 0.5, lineHeight: 18 },
  detailFeaturedBadge: { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, letterSpacing: 2, textAlign: 'center' },
  detailActions:   { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  detailClose:     { flex: 1, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
  detailCloseText: { fontSize: Typography.sizes.xs, color: Colors.textMuted, letterSpacing: 2 },
  detailBuyBtn:    { flex: 2, paddingVertical: Spacing.sm, borderRadius: BorderRadius.sm, alignItems: 'center' },
  detailBuyText:   { fontSize: Typography.sizes.xs, fontWeight: Typography.weights.bold, color: Colors.background, letterSpacing: 2 },

  toast:     { position: 'absolute', bottom: 80, left: Spacing.md, right: Spacing.md, backgroundColor: Colors.surfaceElevated, borderColor: Colors.success, borderWidth: 1, borderRadius: BorderRadius.md, padding: Spacing.md, alignItems: 'center' },
  toastText: { fontSize: Typography.sizes.xs, color: Colors.success, letterSpacing: 2, fontWeight: Typography.weights.bold },
});
