import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ── Module load (graceful fallback when running in Expo Go) ───────────────────
// react-native-google-mobile-ads ships a native module. Expo Go can't load it,
// so we lazy-require and surface ADS_AVAILABLE for the rest of the app to read.

type RewardedShape = {
  load: () => void;
  show: () => Promise<void>;
  addAdEventListener: (type: string, cb: (...args: any[]) => void) => () => void;
};

let mobileAds: (() => Promise<unknown>) | null = null;
let RewardedAdCtor: { createForAdRequest: (unitId: string, opts?: object) => RewardedShape } | null = null;
let RewardedEventType: { LOADED: string; EARNED_REWARD: string } | null = null;
let AdEventType: { ERROR: string } | null = null;
let TestIds: { REWARDED: string } | null = null;

try {
  const googleAds = require('react-native-google-mobile-ads');
  mobileAds         = googleAds.default;
  RewardedAdCtor    = googleAds.RewardedAd;
  RewardedEventType = googleAds.RewardedAdEventType;
  AdEventType       = googleAds.AdEventType;
  TestIds           = googleAds.TestIds;
} catch {
  // Native module unavailable — running in Expo Go or a managed workflow
  // without the dev build. The app will fall back to a stubbed reward flow.
}

export const ADS_AVAILABLE = mobileAds !== null && RewardedAdCtor !== null;

// ── Ad unit IDs ───────────────────────────────────────────────────────────────
// Real IDs come from app.json -> extra.admob in EAS builds. In dev or Expo Go
// we use the Google-provided test IDs, which always serve and never charge.

interface AdMobExtra { rewardedAndroid?: string; rewardedIos?: string }

function getRewardedUnitId(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as { admob?: AdMobExtra };
  const real = Platform.OS === 'ios'
    ? extra.admob?.rewardedIos
    : extra.admob?.rewardedAndroid;
  if (real && !__DEV__) return real;
  return TestIds?.REWARDED ?? '';
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

export const adsService = {
  init,
  showRewardedAd,
};
