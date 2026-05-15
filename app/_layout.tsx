import { useEffect, useState } from 'react';
import { View, LogBox, AppState, Platform } from 'react-native';

// Lazy-required so Expo Go and pre-`npm install` builds don't crash.
async function requestAttIfNeeded() {
  if (Platform.OS !== 'ios') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const att = require('expo-tracking-transparency');
    if (att?.requestTrackingPermissionsAsync) {
      await att.requestTrackingPermissionsAsync();
    }
  } catch {
    // Module not installed yet — fine in dev / Expo Go.
  }
}

LogBox.ignoreLogs(['It looks like you might be using shared value']);
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';
import { useAnomalyStore } from '@/store/useAnomalyStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { useGameStore, flushPendingPersist } from '@/store/useGameStore';
import { useEventStore } from '@/store/useEventStore';
import { UsernameSetupModal } from '@/components/UsernameSetupModal';
import { EventBanner } from '@/components/EventBanner';
import { BuildCompleteBanner } from '@/components/BuildCompleteBanner';
import { OnboardingCarousel, ONBOARDING_KEY } from '@/components/OnboardingCarousel';
import { soundService } from '@/services/SoundService';
import { adsService } from '@/services/AdsService';
import { iapService } from '@/services/IapService';
import { slotsEngine } from '@/services/SlotsEngine';

const APPLIED_ANOMALY_KEY = 'anomaly:lastAppliedOneShot';

export default function RootLayout() {
  const initializeAuth = useAuthStore((s) => s.initialize);
  const user = useAuthStore((s) => s.user);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const tickAnomaly = useAnomalyStore((s) => s.tick);
  const tickHabitat = useHabitatStore((s) => s.tick);
  const tickSpinRefill = useGameStore((s) => s.tickSpinRefill);
  const tickGeneratorIncome = useGameStore((s) => s.tickGeneratorIncome);
  const subscribeToEvents = useEventStore((s) => s.subscribe);

  useEffect(() => {
    void soundService.preload();
    void adsService.init();
    const unsubAuth = initializeAuth();
    const anomalyInterval = setInterval(tickAnomaly, 60_000);
    const secondInterval = setInterval(() => {
      tickHabitat();
      tickSpinRefill();
    }, 1_000);
    const generatorInterval = setInterval(tickGeneratorIncome, 30_000);
    // Track foreground/background transitions so we can flush on suspend AND
    // immediately re-tick on resume — `setInterval` doesn't run while the app
    // is backgrounded, so a build that should have completed while away
    // would otherwise show the wrong remaining time until the next interval
    // fires.
    let lastActiveAt = Date.now();
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        flushPendingPersist();
        lastActiveAt = Date.now();
      } else if (state === 'active') {
        const awayMs = Date.now() - lastActiveAt;
        // Only catch up if we were actually away for >2s (filters out the
        // momentary inactive→active flicker on iOS notification permission
        // sheets, etc).
        if (awayMs > 2_000) {
          tickHabitat();
          tickSpinRefill();
          tickGeneratorIncome();
          tickAnomaly();
        }
      }
    });

    return () => {
      unsubAuth();
      clearInterval(anomalyInterval);
      clearInterval(secondInterval);
      clearInterval(generatorInterval);
      appStateSub.remove();
    };
  }, []);

  // Show onboarding carousel once per install
  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY).then((val) => {
      if (!val) setShowOnboarding(true);
    });
  }, []);

  // Subscribe to incoming PvP events once authenticated
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToEvents(user.uid);
    return unsub;
  }, [user?.uid]);

  // Anomaly → engine hook sync. Pushes slot-engine-relevant flags into the
  // singleton on every snapshot, plus one-shot side effects (CHRONO_BLOOM
  // jump, STARDUST_WAKE counter reset) keyed on activeAnomaly.startedAt so
  // a re-mount or onSnapshot replay doesn't double-fire.
  useEffect(() => {
    const unsub = useAnomalyStore.subscribe((state) => {
      const def = state.definition;
      slotsEngine.setAnomalyHooks({
        riftTierBoost:   def?.riftTierBoost ?? 0,
        scrambleWeights: def?.scrambleWeightsEnabled ?? false,
        mirrorReels:     def?.mirrorReelsEnabled ?? false,
      });

      const active = state.activeAnomaly;
      if (!active || !def) return;
      const fingerprint = `${active.id}:${active.startedAt}`;
      AsyncStorage.getItem(APPLIED_ANOMALY_KEY).then((prev) => {
        if (prev === fingerprint) return;
        AsyncStorage.setItem(APPLIED_ANOMALY_KEY, fingerprint);
        if (def.buildJumpMs) useHabitatStore.getState().jumpActiveJob(def.buildJumpMs);
        if (def.stardustGrantInterval) useGameStore.getState().resetStardustWakeCounter();
      });
    });
    return unsub;
  }, []);

  // Configure RevenueCat with the Firebase UID once we have it. Requesting
  // App Tracking Transparency on iOS is best done shortly after launch and
  // before the first ad request — call it here, lazily, so it doesn't block
  // anything else.
  useEffect(() => {
    if (!user?.uid) return;
    void iapService.init(user.uid);
    void requestAttIfNeeded();
  }, [user?.uid]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" backgroundColor={Colors.background} />
      <View style={{ flex: 1 }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'fade',
          }}
        />
        <UsernameSetupModal />
        <EventBanner />
        <BuildCompleteBanner />
        {showOnboarding && <OnboardingCarousel onDismiss={() => setShowOnboarding(false)} />}
      </View>
    </GestureHandlerRootView>
  );
}
