import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ── Module load (graceful fallback when running in Expo Go or before npm install) ──
// react-native-purchases ships a native module. Mirrors AdsService — lazy-require
// so the rest of the app can boot without it and we can ship a stubbed dev flow.

type PurchasesModule = {
  configure: (config: { apiKey: string; appUserID?: string | null }) => void;
  logIn:  (uid: string) => Promise<unknown>;
  logOut: () => Promise<unknown>;
  getOfferings: () => Promise<{ current?: { availablePackages: PurchasesPackage[] } | null }>;
  getProducts: (ids: string[]) => Promise<PurchasesProduct[]>;
  purchaseProduct: (productId: string) => Promise<{
    customerInfo: unknown;
    productIdentifier: string;
    transactionIdentifier?: string;
  }>;
  restorePurchases: () => Promise<{ activeSubscriptions: string[]; allPurchasedProductIdentifiers?: string[] }>;
  setLogLevel: (level: string) => void;
  LOG_LEVEL: { DEBUG: string; INFO: string; WARN: string; ERROR: string; VERBOSE: string };
};

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

let Purchases: PurchasesModule | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-purchases');
  Purchases = (mod.default ?? mod) as PurchasesModule;
} catch {
  // Package not installed or running in Expo Go — stay null, IapService will
  // serve a stubbed dev experience that resolves purchases as if they
  // succeeded (with __DEV__-only credit/spin grants applied client-side).
}

export const IAP_AVAILABLE = Purchases !== null;

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
    initialized = true;
    initializedUid = uid;
    return;
  }
  // UID changed mid-session (sign-in/out flow) — switch the RC user.
  if (initializedUid !== uid) {
    try { await Purchases.logIn(uid); }
    catch (e) { console.error('[iap] logIn failed', e); }
    initializedUid = uid;
  }
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

// Batch version for the store screen — fewer round trips than calling
// getLocalizedPrice in a loop. Returns a sparse map (productId → priceString)
// for whatever resolved; callers should fall back to baked-in prices for
// missing entries. Empty object in stub mode.
async function getPrices(ids: string[]): Promise<Record<string, string>> {
  if (!IAP_AVAILABLE || !Purchases || !initialized || ids.length === 0) return {};
  try {
    const products = await Purchases.getProducts(ids);
    const out: Record<string, string> = {};
    for (const p of products) out[p.identifier] = p.priceString;
    return out;
  } catch {
    return {};
  }
}

export const iapService = {
  init,
  purchase,
  restore,
  getLocalizedPrice,
  getPrices,
};
