// Dynamic config — Expo merges app.json into the `config` argument before
// calling this function, so we extend rather than re-declare static values.
// Sensitive IDs are read from environment variables so they're never
// committed to version control. Expo loads .env.local before evaluating
// this file, so process.env is already populated.
//
// Development (no .env.local):
//   AdMob plugin falls back to Google's official test App IDs — test ads
//   always serve. Ad unit IDs and RevenueCat keys fall back to ''; the
//   AdsService and IapService stubs handle empty values gracefully (rewarded
//   ads simulate, IAP purchases resolve as { stubbed: true }).
//
// Production (EAS build with .env.local filled in OR EAS env vars set):
//   Fill in all ADMOB_*, REVENUECAT_*, and EXPO_PUBLIC_FIREBASE_* before
//   running `eas build`. EAS_PROJECT_ID is hardcoded below (it's a public
//   project identifier, not a secret — EAS CLI expects it committed).

const TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const TEST_IOS_APP_ID     = 'ca-app-pub-3940256099942544~1458002511';

const USER_TRACKING_COPY =
  'We use this to show you ads relevant to your interests, which keeps the game free.';

// Build info — captured at config-eval time (i.e. when the dev server starts
// or when EAS evaluates app.config.js for a release build). Surfaced via
// extra.buildInfo so the dev menu can show "you're running commit X from
// branch Y" — useful for confirming Metro / EAS picked up the latest push.
function captureBuildInfo() {
  const now = new Date();
  const info = {
    sha: 'unknown',
    shortSha: 'unknown',
    branch: 'unknown',
    commitDate: 'unknown',
    commitMessage: 'unknown',
    dirty: false,
    configEvaluatedAt: now.toISOString(),
  };
  try {
    const { execSync } = require('child_process');
    const run = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    info.sha           = run('git rev-parse HEAD');
    info.shortSha      = run('git rev-parse --short HEAD');
    info.branch        = run('git rev-parse --abbrev-ref HEAD');
    info.commitDate    = run('git log -1 --format=%cI');
    info.commitMessage = run('git log -1 --format=%s');
    info.dirty         = run('git status --porcelain').length > 0;
  } catch {
    // Not in a git repo or git not available — leave defaults.
  }
  return info;
}

const BUILD_INFO = captureBuildInfo();

module.exports = ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins ?? []),
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: process.env.ADMOB_ANDROID_APP_ID ?? TEST_ANDROID_APP_ID,
        iosAppId:     process.env.ADMOB_IOS_APP_ID     ?? TEST_IOS_APP_ID,
        userTrackingPermission: USER_TRACKING_COPY,
      },
    ],
  ],
  extra: {
    ...(config.extra ?? {}),
    firebaseApiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            ?? '',
    firebaseAuthDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? '',
    firebaseProjectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         ?? '',
    firebaseStorageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? '',
    firebaseMessagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
    firebaseAppId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             ?? '',
    admob: {
      rewardedAndroid:     process.env.ADMOB_REWARDED_ANDROID     ?? '',
      rewardedIos:         process.env.ADMOB_REWARDED_IOS         ?? '',
      interstitialAndroid: process.env.ADMOB_INTERSTITIAL_ANDROID ?? '',
      interstitialIos:     process.env.ADMOB_INTERSTITIAL_IOS     ?? '',
    },
    revenueCat: {
      publicKeyIos:     process.env.REVENUECAT_PUBLIC_KEY_IOS     ?? '',
      publicKeyAndroid: process.env.REVENUECAT_PUBLIC_KEY_ANDROID ?? '',
    },
    eas: {
      projectId: '643f084a-afb7-4ef8-9336-f483460387de',
    },
    buildInfo: BUILD_INFO,
  },
});
