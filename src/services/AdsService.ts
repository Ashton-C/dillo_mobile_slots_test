import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Module load (graceful fallback when running in Expo Go) ───────────────────
// react-native-google-mobile-ads ships a native module. Expo Go can't load it,
// so we lazy-require and surface ADS_AVAILABLE for the rest of the app to read.

type AdShape = {
  load: () => void;
  show: () => Promise<void>;
  addAdEventListener: (type: string, cb: (...args: any[]) => void) => () => void;
};

let mobileAds: (() => Promise<unknown>) | null = null;
let RewardedAdCtor: { createForAdRequest: (unitId: string, opts?: object) => AdShape } | null = null;
let InterstitialAdCtor: { createForAdRequest: (unitId: string, opts?: object) => AdShape } | null = null;
let RewardedEventType: { LOADED: string; EARNED_REWARD: string } | null = null;
let AdEventType: { LOADED: string; ERROR: string; CLOSED: string } | null = null;
let TestIds: { REWARDED: string; INTERSTITIAL: string } | null = null;

try {
  const googleAds = require('react-native-google-mobile-ads');
  mobileAds          = googleAds.default;
  RewardedAdCtor     = googleAds.RewardedAd;
  InterstitialAdCtor = googleAds.InterstitialAd;
  RewardedEventType  = googleAds.RewardedAdEventType;
  AdEventType        = googleAds.AdEventType;
  TestIds            = googleAds.TestIds;
} catch {
  // Native module unavailable — running in Expo Go or a managed workflow
  // without the dev build. The app will fall back to a stubbed reward flow.
}

export const ADS_AVAILABLE = mobileAds !== null && RewardedAdCtor !== null;

// ── ATT-driven personalization ────────────────────────────────────────────────
// iOS 14.5+ requires App Tracking Transparency permission before serving
// personalized ads. We default to non-personalized (NPA = true) until the
// user grants ATT in the system prompt. On Android there's no ATT so we
// always allow personalized ads — Google's consent flow handles GDPR.

let personalizedAdsAllowed = false;

function refreshTrackingStatus(): void {
  if (Platform.OS !== 'ios') {
    personalizedAdsAllowed = true;
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const att = require('expo-tracking-transparency');
    const status = att?.getTrackingPermissionsAsync;
    if (!status) return;
    // Synchronous read of cached value via the SDK's internal getter; fall
    // back to async on first call.
    void att.getTrackingPermissionsAsync().then((r: { status?: string }) => {
      personalizedAdsAllowed = r?.status === 'granted';
    });
  } catch {
    // Module not installed — leave NPA on.
  }
}

refreshTrackingStatus();

export function setPersonalizedAdsAllowed(allowed: boolean): void {
  personalizedAdsAllowed = allowed;
}

function adRequestOptions() {
  return { requestNonPersonalizedAdsOnly: !personalizedAdsAllowed };
}

// ── Ad unit IDs ───────────────────────────────────────────────────────────────
// Real IDs come from app.json -> extra.admob in EAS builds. In dev or Expo Go
// we use the Google-provided test IDs, which always serve and never charge.

interface AdMobExtra {
  rewardedAndroid?: string;
  rewardedIos?: string;
  interstitialAndroid?: string;
  interstitialIos?: string;
}

function getRewardedUnitId(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { admob?: AdMobExtra };
  const real = Platform.OS === 'ios'
    ? extra.admob?.rewardedIos
    : extra.admob?.rewardedAndroid;
  if (real && !__DEV__) return real;
  return TestIds?.REWARDED ?? '';
}

function getInterstitialUnitId(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { admob?: AdMobExtra };
  const real = Platform.OS === 'ios'
    ? extra.admob?.interstitialIos
    : extra.admob?.interstitialAndroid;
  if (real && !__DEV__) return real;
  return TestIds?.INTERSTITIAL ?? '';
}

// ── Service ───────────────────────────────────────────────────────────────────

let initialized = false;

async function init(): Promise<void> {
  if (initialized || !ADS_AVAILABLE || !mobileAds) return;
  try {
    await mobileAds();
    initialized = true;
  } catch {
    // Initialisation failure is non-fatal — leave ADS_AVAILABLE alone but
    // showRewardedAd() will fall back to the stub.
  }
}

interface ShowResult {
  rewarded: boolean;          // user watched to completion and earned the reward
  available: boolean;         // a real ad was actually shown (false = stub)
}

async function showRewardedAd(): Promise<ShowResult> {
  if (!ADS_AVAILABLE || !RewardedAdCtor || !RewardedEventType || !AdEventType) {
    // Stub: simulate a watched ad immediately so dev flow still works.
    return { rewarded: true, available: false };
  }
  await init();

  return new Promise<ShowResult>((resolve) => {
    const ad = RewardedAdCtor!.createForAdRequest(getRewardedUnitId(), {
      requestNonPersonalizedAdsOnly: true,
    });

    let resolved = false;
    const settle = (result: ShowResult) => {
      if (resolved) return;
      resolved = true;
      resolve(result);
    };

    const offLoaded = ad.addAdEventListener(RewardedEventType!.LOADED, () => {
      void ad.show().catch(() => settle({ rewarded: false, available: true }));
    });
    const offReward = ad.addAdEventListener(RewardedEventType!.EARNED_REWARD, () => {
      settle({ rewarded: true, available: true });
    });
    const offError  = ad.addAdEventListener(AdEventType!.ERROR, () => {
      settle({ rewarded: false, available: true });
    });

    // Safety timeout — if the ad SDK never fires a terminal event, give up.
    const t = setTimeout(() => settle({ rewarded: false, available: true }), 30_000);

    ad.load();

    // Cleanup happens implicitly on resolve; we just need to clear the timer.
    void Promise.resolve().then(async () => {
      // no-op — placeholder for future ad pre-loading
    });
    void [offLoaded, offReward, offError, t];
  });
}

async function showInterstitialAd(): Promise<{ shown: boolean }> {
  if (!ADS_AVAILABLE || !InterstitialAdCtor || !AdEventType) return { shown: false };
  await init();

  return new Promise<{ shown: boolean }>((resolve) => {
    const ad = InterstitialAdCtor!.createForAdRequest(getInterstitialUnitId(), {
      requestNonPersonalizedAdsOnly: true,
    });
    let settled = false;
    const finish = (shown: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ shown });
    };
    ad.addAdEventListener(AdEventType!.LOADED, () => {
      void ad.show().catch(() => finish(false));
    });
    ad.addAdEventListener(AdEventType!.CLOSED, () => finish(true));
    ad.addAdEventListener(AdEventType!.ERROR,  () => finish(false));
    setTimeout(() => finish(false), 30_000);
    ad.load();
  });
}

// ── Interstitial frequency cap ────────────────────────────────────────────────
// Don't show more than one interstitial within MIN_INTERSTITIAL_GAP_MS,
// regardless of how many trigger points fire. Persisted across app launches
// so a kill-and-relaunch can't bypass it.

const INTERSTITIAL_LAST_KEY = '@interstitial_last_at';
const MIN_INTERSTITIAL_GAP_MS = 4 * 60_000; // every 4 minutes max

async function maybeShowInterstitial(reason: string): Promise<{ shown: boolean }> {
  try {
    const raw = await AsyncStorage.getItem(INTERSTITIAL_LAST_KEY);
    const last = raw ? parseInt(raw, 10) : 0;
    if (Date.now() - last < MIN_INTERSTITIAL_GAP_MS) {
      if (__DEV__) console.log(`[ads] skipping interstitial (${reason}) — within cooldown`);
      return { shown: false };
    }
    const r = await showInterstitialAd();
    if (r.shown) {
      await AsyncStorage.setItem(INTERSTITIAL_LAST_KEY, String(Date.now()));
    }
    return r;
  } catch {
    return { shown: false };
  }
}

export const adsService = {
  init,
  showRewardedAd,
  showInterstitialAd,
  maybeShowInterstitial,
};
