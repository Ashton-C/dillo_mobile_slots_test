import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ── Module load (graceful fallback when running in Expo Go or before npm install) ──
// react-native-purchases ships a native module. Mirrors AdsService — lazy-require
// so the rest of the app can boot without it and we can ship a stubbed dev flow.

interface PurchasesPackage {
  identifier: string;
  product: PurchasesProduct;
}

interface PurchasesProduct {
  identifier: string;
  priceString: string;
  price: number;
  title: string;
  description: string;
}

interface PurchasesEntitlementInfo {
  identifier: string;
  isActive: boolean;
  willRenew: boolean;
  productIdentifier: string;
  expirationDate: string | null;
}

export interface CustomerInfo {
  originalAppUserId: string;
  activeSubscriptions: string[];
  allPurchasedProductIdentifiers: string[];
  entitlements: { active: Record<string, PurchasesEntitlementInfo> };
}

type PurchasesModule = {
  configure: (config: { apiKey: string; appUserID?: string | null }) => void;
  logIn:  (uid: string) => Promise<unknown>;
  logOut: () => Promise<unknown>;
  getOfferings: () => Promise<{ current?: { availablePackages: PurchasesPackage[] } | null }>;
  getProducts: (ids: string[]) => Promise<PurchasesProduct[]>;
  purchaseProduct: (productId: string) => Promise<{
    customerInfo: CustomerInfo;
    productIdentifier: string;
    transactionIdentifier?: string;
  }>;
  restorePurchases: () => Promise<CustomerInfo>;
  getCustomerInfo: () => Promise<CustomerInfo>;
  addCustomerInfoUpdateListener: (cb: (info: CustomerInfo) => void) => void;
  removeCustomerInfoUpdateListener: (cb: (info: CustomerInfo) => void) => void;
  setLogLevel: (level: string) => void;
  LOG_LEVEL: { DEBUG: string; INFO: string; WARN: string; ERROR: string; VERBOSE: string };
};

type PurchasesUiModule = {
  // Returns one of: PURCHASED / RESTORED / CANCELLED / ERROR / NOT_PRESENTED
  presentPaywall: (opts?: {
    offering?: { identifier: string };
    displayCloseButton?: boolean;
  }) => Promise<string>;
  presentPaywallIfNeeded: (opts: {
    requiredEntitlementIdentifier: string;
    offering?: { identifier: string };
    displayCloseButton?: boolean;
  }) => Promise<string>;
  presentCustomerCenter: () => Promise<void>;
  PAYWALL_RESULT: {
    NOT_PRESENTED: string;
    ERROR: string;
    CANCELLED: string;
    PURCHASED: string;
    RESTORED: string;
  };
};

let Purchases: PurchasesModule | null = null;
let PurchasesUi: PurchasesUiModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-purchases');
  Purchases = (mod.default ?? mod) as PurchasesModule;
} catch {
  // Package not installed or running in Expo Go — stay null, IapService will
  // serve a stubbed dev experience that resolves purchases as if they
  // succeeded (with __DEV__-only credit/spin grants applied client-side).
}

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-purchases-ui');
  PurchasesUi = (mod.default ?? mod) as PurchasesUiModule;
} catch {
  // Optional — only needed for the prebuilt Paywall + Customer Center UI.
}

export const IAP_AVAILABLE = Purchases !== null;
export const IAP_UI_AVAILABLE = PurchasesUi !== null;

// ── Config ────────────────────────────────────────────────────────────────────
// Keys come from app.json -> extra.revenueCat. Until they're populated we
// stay in stub mode even in production builds (configure() does nothing on
// empty keys), so a half-configured release won't trigger silent purchase
// errors against an empty RC project.

interface RevenueCatExtra {
  publicKeyIos?: string;
  publicKeyAndroid?: string;
}

function getPublicKey(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { revenueCat?: RevenueCatExtra };
  return Platform.OS === 'ios'
    ? (extra.revenueCat?.publicKeyIos ?? '')
    : (extra.revenueCat?.publicKeyAndroid ?? '');
}

let initialized = false;
let initializedUid: string | null = null;
let cachedCustomerInfo: CustomerInfo | null = null;
const customerInfoSubscribers = new Set<(info: CustomerInfo) => void>();

function notifySubscribers(info: CustomerInfo) {
  cachedCustomerInfo = info;
  for (const cb of customerInfoSubscribers) {
    try { cb(info); } catch (e) { console.error('[iap] customer-info subscriber threw', e); }
  }
}

async function init(uid: string): Promise<void> {
  if (!IAP_AVAILABLE || !Purchases) return;
  const key = getPublicKey();
  if (!key) {
    if (__DEV__) console.warn('[iap] no RevenueCat public key set; staying in stub mode');
    return;
  }
  // First-time configure
  if (!initialized) {
    Purchases.configure({ apiKey: key, appUserID: uid });
    if (__DEV__) Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN);
    Purchases.addCustomerInfoUpdateListener(notifySubscribers);
    initialized = true;
    initializedUid = uid;
    // Prime the cache so consumers don't have to wait for the first event.
    void Purchases.getCustomerInfo()
      .then((info) => { cachedCustomerInfo = info; })
      .catch((e) => console.error('[iap] initial getCustomerInfo failed', e));
    return;
  }
  // UID changed mid-session (sign-in/out flow) — switch the RC user.
  if (initializedUid !== uid) {
    try { await Purchases.logIn(uid); }
    catch (e) { console.error('[iap] logIn failed', e); }
    initializedUid = uid;
  }
}

// Subscribe to live CustomerInfo updates. RC fires this whenever a purchase
// resolves, the entitlement set changes, or the app foregrounds and refreshes
// the cached info from the backend. Returns the unsubscribe function and
// invokes the callback synchronously with the cached value when available.
function onCustomerInfo(cb: (info: CustomerInfo) => void): () => void {
  customerInfoSubscribers.add(cb);
  if (cachedCustomerInfo) cb(cachedCustomerInfo);
  return () => { customerInfoSubscribers.delete(cb); };
}

async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!IAP_AVAILABLE || !Purchases || !initialized) return null;
  if (cachedCustomerInfo) return cachedCustomerInfo;
  try {
    const info = await Purchases.getCustomerInfo();
    cachedCustomerInfo = info;
    return info;
  } catch (e) {
    console.error('[iap] getCustomerInfo failed', e);
    return null;
  }
}

function hasActiveEntitlement(entitlementId: string): boolean {
  return !!cachedCustomerInfo?.entitlements?.active?.[entitlementId];
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface IapPurchaseResult {
  ok: boolean;
  productId: string;
  transactionId?: string;
  // True when the result came from the Expo-Go / no-key stub path. The
  // server webhook is the source of truth in production; in stub mode we
  // grant rewards client-side from useGameStore so devs can iterate.
  stubbed: boolean;
  error?: string;
}

async function purchase(productId: string): Promise<IapPurchaseResult> {
  if (!IAP_AVAILABLE || !Purchases || !initialized) {
    if (__DEV__) console.log('[iap stub] purchase', productId);
    return { ok: true, productId, stubbed: true, transactionId: `stub_${Date.now()}` };
  }
  try {
    const r = await Purchases.purchaseProduct(productId);
    return {
      ok: true,
      productId: r.productIdentifier,
      transactionId: r.transactionIdentifier,
      stubbed: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // RC throws with userCancelled === true on cancel; surface it cleanly
    const cancelled = (err as { userCancelled?: boolean })?.userCancelled === true;
    return {
      ok: false,
      productId,
      stubbed: false,
      error: cancelled ? 'cancelled' : msg,
    };
  }
}

async function restore(): Promise<{ ok: boolean; restoredProductIds: string[]; stubbed: boolean }> {
  if (!IAP_AVAILABLE || !Purchases || !initialized) {
    return { ok: true, restoredProductIds: [], stubbed: true };
  }
  try {
    const r = await Purchases.restorePurchases();
    return {
      ok: true,
      restoredProductIds: r.allPurchasedProductIdentifiers ?? [],
      stubbed: false,
    };
  } catch (err) {
    console.error('[iap] restore failed', err);
    return { ok: false, restoredProductIds: [], stubbed: false };
  }
}

// Lookup the localized price string for a known product (e.g. "$0.99").
// Returns null if RC isn't configured or the product isn't found — callers
// should fall back to the price baked into StoreService.PACKS.
async function getLocalizedPrice(productId: string): Promise<string | null> {
  if (!IAP_AVAILABLE || !Purchases || !initialized) return null;
  try {
    const products = await Purchases.getProducts([productId]);
    return products[0]?.priceString ?? null;
  } catch {
    return null;
  }
}

// Batch version for the store screen. Tries Offerings first (the modern,
// dashboard-configurable RC pattern) and falls back to direct getProducts so
// a missing or unconfigured Offering doesn't blank out prices. Returns a
// sparse map (productId → priceString); callers should fall back to baked-in
// prices for missing entries. Empty object in stub mode.
async function getPrices(ids: string[]): Promise<Record<string, string>> {
  if (!IAP_AVAILABLE || !Purchases || !initialized || ids.length === 0) return {};
  const out: Record<string, string> = {};
  try {
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    for (const pkg of packages) {
      out[pkg.product.identifier] = pkg.product.priceString;
    }
  } catch {
    // Offerings unavailable — fall through to getProducts.
  }
  const missing = ids.filter((id) => !(id in out));
  if (missing.length === 0) return out;
  try {
    const products = await Purchases.getProducts(missing);
    for (const p of products) out[p.identifier] = p.priceString;
  } catch {
    // Leave the gaps — callers use baked-in fallback.
  }
  return out;
}

// Present the prebuilt RC Paywall UI. Resolves to the result string —
// 'PURCHASED', 'RESTORED', 'CANCELLED', 'ERROR', or 'NOT_PRESENTED'. The
// purchase event still flows through addCustomerInfoUpdateListener and the
// server webhook, so the only thing the call site needs to do is decide
// what to show on success vs. cancel.
async function presentPaywall(opts?: {
  offeringId?: string;
  displayCloseButton?: boolean;
}): Promise<string> {
  if (!IAP_UI_AVAILABLE || !PurchasesUi) {
    if (__DEV__) console.log('[iap stub] presentPaywall', opts);
    return 'NOT_PRESENTED';
  }
  try {
    return await PurchasesUi.presentPaywall({
      offering: opts?.offeringId ? { identifier: opts.offeringId } : undefined,
      displayCloseButton: opts?.displayCloseButton ?? true,
    });
  } catch (e) {
    console.error('[iap] presentPaywall failed', e);
    return 'ERROR';
  }
}

// Variant that no-ops when the user already holds an entitlement. Useful for
// gating a feature ("Reelwright Pro") behind a one-tap upsell without
// re-prompting players who already paid.
async function presentPaywallIfNeeded(entitlementId: string, offeringId?: string): Promise<string> {
  if (!IAP_UI_AVAILABLE || !PurchasesUi) {
    if (__DEV__) console.log('[iap stub] presentPaywallIfNeeded', entitlementId);
    return 'NOT_PRESENTED';
  }
  try {
    return await PurchasesUi.presentPaywallIfNeeded({
      requiredEntitlementIdentifier: entitlementId,
      offering: offeringId ? { identifier: offeringId } : undefined,
      displayCloseButton: true,
    });
  } catch (e) {
    console.error('[iap] presentPaywallIfNeeded failed', e);
    return 'ERROR';
  }
}

// Apple-mandated equivalent of "Restore Purchases" plus refund / manage-subs
// flow. Replaces our hand-rolled RESTORE button. Falls back to plain restore()
// when the UI package isn't installed.
async function presentCustomerCenter(): Promise<{ shown: boolean }> {
  if (!IAP_UI_AVAILABLE || !PurchasesUi) {
    if (__DEV__) console.log('[iap stub] presentCustomerCenter');
    return { shown: false };
  }
  try {
    await PurchasesUi.presentCustomerCenter();
    return { shown: true };
  } catch (e) {
    console.error('[iap] presentCustomerCenter failed', e);
    return { shown: false };
  }
}

export const iapService = {
  init,
  purchase,
  restore,
  getLocalizedPrice,
  getPrices,
  getCustomerInfo,
  onCustomerInfo,
  hasActiveEntitlement,
  presentPaywall,
  presentPaywallIfNeeded,
  presentCustomerCenter,
};
