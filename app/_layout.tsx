import { useEffect } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';
import { useAnomalyStore } from '@/store/useAnomalyStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { useGameStore } from '@/store/useGameStore';
import { useEventStore } from '@/store/useEventStore';
import { UsernameSetupModal } from '@/components/UsernameSetupModal';
import { EventBanner } from '@/components/EventBanner';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  const initializeAuth = useAuthStore((s) => s.initialize);
  const user = useAuthStore((s) => s.user);
  const tickAnomaly = useAnomalyStore((s) => s.tick);
  const tickHabitat = useHabitatStore((s) => s.tick);
  const tickSpinRefill = useGameStore((s) => s.tickSpinRefill);
  const tickGeneratorIncome = useGameStore((s) => s.tickGeneratorIncome);
  const subscribeToEvents = useEventStore((s) => s.subscribe);

  useEffect(() => {
    const unsubAuth = initializeAuth();
    const anomalyInterval = setInterval(tickAnomaly, 60_000);
    const secondInterval = setInterval(() => {
      tickHabitat();
      tickSpinRefill();
    }, 1_000);
    const generatorInterval = setInterval(tickGeneratorIncome, 30_000);

    return () => {
      unsubAuth();
      clearInterval(anomalyInterval);
      clearInterval(secondInterval);
      clearInterval(generatorInterval);
    };
  }, []);

  // Subscribe to incoming PvP events once authenticated
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToEvents(user.uid);
    return unsub;
  }, [user?.uid]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
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
        </View>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
