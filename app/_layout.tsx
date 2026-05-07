import { useEffect, useState } from 'react';
import { View, LogBox, AppState } from 'react-native';

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
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') flushPendingPersist();
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
