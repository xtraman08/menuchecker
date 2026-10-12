import { router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { errorMessage, isMockApi } from '@/api/client';
import { useRestaurants } from '@/api/hooks';
import type { RestaurantSummary } from '@/api/types';
import { Button, ErrorText, Screen } from '@/components/ui';
import { color, radius, space, type } from '@/theme';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export default function Library() {
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 300);
  const restaurants = useRestaurants(q);

  return (
    <Screen testID="library-screen">
      <Stack.Screen
        options={{
          headerRight: () => (
            <Button
              label="Taste profile"
              variant="quiet"
              onPress={() => router.push('/profile')}
              testID="library-profile-button"
            />
          ),
        }}
      />

      <View style={styles.intro}>
        <Text style={type.title}>Menus other diners have decoded</Text>
        <Text style={type.body}>
          Open one to see what every dish is, or scan a new menu to add it.
        </Text>
        {isMockApi ? (
          <Text style={type.small} testID="library-mock-notice">
            Demo data: no API URL is configured.
          </Text>
        ) : null}
      </View>

      <Button
        label="Scan a menu"
        onPress={() => router.push('/scan')}
        testID="library-scan-button"
      />

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search by restaurant or cuisine"
        placeholderTextColor={color.muted}
        accessibilityLabel="Search restaurants"
        style={styles.search}
        testID="library-search"
        autoCorrect={false}
      />

      {restaurants.isPending ? (
        <ActivityIndicator color={color.ink} testID="library-loading" />
      ) : restaurants.isError ? (
        <View style={{ gap: space.sm }}>
          <ErrorText testID="library-error">{errorMessage(restaurants.error)}</ErrorText>
          <Button
            label="Try again"
            variant="secondary"
            onPress={() => restaurants.refetch()}
            testID="library-retry"
          />
        </View>
      ) : restaurants.data.length === 0 ? (
        <Text style={type.body} testID="library-empty">
          {q
            ? `No saved menus match "${q}". Scan the menu to add it.`
            : 'No menus yet. Scan the first one and everyone using Fare will see it.'}
        </Text>
      ) : (
        <View style={{ gap: space.sm }} testID="library-list">
          {restaurants.data.map((r) => (
            <RestaurantRow key={r.id} r={r} />
          ))}
        </View>
      )}
    </Screen>
  );
}

function RestaurantRow({ r }: { r: RestaurantSummary }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/restaurant/[id]', params: { id: r.id } })}
      accessibilityRole="link"
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      testID={`library-item-${r.id}`}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.dishNameCompact} testID={`library-item-name-${r.id}`}>
          {r.name}
        </Text>
        <Text style={type.small}>{[r.cuisine, r.address].filter(Boolean).join(', ')}</Text>
      </View>
      {typeof r.dishCount === 'number' ? (
        <Text style={type.small}>
          {r.dishCount} {r.dishCount === 1 ? 'dish' : 'dishes'}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  intro: { gap: space.sm },
  search: {
    minHeight: 44,
    borderWidth: 1,
    borderColor: color.line,
    borderRadius: radius.md,
    backgroundColor: color.card,
    paddingHorizontal: space.md,
    fontSize: 16,
    color: color.ink,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    backgroundColor: color.card,
    borderRadius: radius.md,
    borderLeftWidth: 3,
    borderLeftColor: color.ink,
  },
});
