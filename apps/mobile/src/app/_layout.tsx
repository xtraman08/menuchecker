import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppStateProvider } from '@/state/AppState';
import { color, font } from '@/theme';

export default function RootLayout() {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }),
  );
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AppStateProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: color.paper },
              headerShadowVisible: false,
              headerTintColor: color.ink,
              headerTitleStyle: { fontFamily: font.body, fontWeight: '600' },
              contentStyle: { backgroundColor: color.paper },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="onboarding" options={{ title: 'Your taste' }} />
            <Stack.Screen name="library" options={{ title: 'Fare', headerBackVisible: false }} />
            <Stack.Screen name="restaurant/[id]" options={{ title: 'Menu' }} />
            <Stack.Screen name="scan" options={{ title: 'Scan a menu' }} />
            <Stack.Screen name="review" options={{ title: 'Check the dishes' }} />
            <Stack.Screen
              name="feedback/[dishId]"
              options={{ title: 'Rate this dish', presentation: 'modal' }}
            />
            <Stack.Screen name="profile" options={{ title: 'Taste profile' }} />
          </Stack>
        </AppStateProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
