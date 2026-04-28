import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from 'react-query';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/store/useAuthStore';
import { useAnomalyStore } from '@/store/useAnomalyStore';
import { useHabitatStore } from '@/store/useHabitatStore';
import { UsernameSetupModal } from '@/components/UsernameSetupModal';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  const initializeAuth = useAuthStore((s) => s.initialize);
  const tickAnomaly = useAnomalyStore((s) => s.tick);
  const tickHabitat = useHabitatStore((s) => s.tick);

  useEffect(() => {
    const unsubAuth = initializeAuth();
    const anomalyInterval = setInterval(tickAnomaly, 60_000);
    const habitatInterval = setInterval(tickHabitat, 1_000);

    return () => {
      unsubAuth();
      clearInterval(anomalyInterval);
      clearInterval(habitatInterval);
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" backgroundColor={Colors.background} />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Colors.background },
            animation: 'fade',
          }}
        />
        <UsernameSetupModal />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
