import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { errorMessage } from '@/api/client';
import { useRestaurant, useTasteProfile } from '@/api/hooks';
import { DishCard } from '@/components/DishCard';
import { ShortlistBar } from '@/components/ShortlistBar';
import { Button, Chip, ErrorText, Screen } from '@/components/ui';
import {
  ADVENTURE_FILTERS,
  SPICE_FILTERS,
  visibleDishes,
  type AdventureFilter,
  type SortMode,
  type SpiceFilter,
} from '@/lib/menu';
import { useAppState } from '@/state/AppState';
import { color, space, type } from '@/theme';

export default function RestaurantScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const detail = useRestaurant(id);
  const profile = useTasteProfile();
  const { shortlists, addToShortlist, clearShortlist } = useAppState();
  const [spice, setSpice] = useState<SpiceFilter>('any');
  const [adventure, setAdventure] = useState<AdventureFilter>('any');
  const [sort, setSort] = useState<SortMode>('menu');

  if (detail.isPending) {
    return (
      <Screen testID="restaurant-screen">
        <ActivityIndicator color={color.ink} testID="restaurant-loading" />
      </Screen>
    );
  }
  if (detail.isError) {
    return (
      <Screen testID="restaurant-screen">
        <ErrorText testID="restaurant-error">{errorMessage(detail.error)}</ErrorText>
        <Button label="Try again" variant="secondary" onPress={() => detail.refetch()} testID="restaurant-retry" />
      </Screen>
    );
  }

  const { restaurant, dishes } = detail.data;
  const known = profile.data?.cuisinesTried.some((c) => c.toLowerCase() === restaurant.cuisine.toLowerCase());
  const variant = known ? 'familiar' : 'unfamiliar';
  const lines = shortlists[restaurant.id] ?? [];
  const shown = visibleDishes(dishes, { spice, adventure, sort });

  return (
    <Screen
      testID="restaurant-screen"
      footer={<ShortlistBar lines={lines} onClear={() => clearShortlist(restaurant.id)} />}
    >
      <Stack.Screen options={{ title: restaurant.name }} />
      <View style={{ gap: space.xs }}>
        <Text style={type.title} testID="restaurant-name">
          {restaurant.name}
        </Text>
        <Text style={type.body} testID="restaurant-cuisine">
          {[restaurant.cuisine, restaurant.address].filter(Boolean).join(', ')}
        </Text>
      </View>

      <View style={styles.controls}>
        <View style={styles.chips}>
          {SPICE_FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              selected={spice === f.value}
              onPress={() => setSpice(f.value)}
              testID={`filter-spice-${f.value}`}
            />
          ))}
        </View>
        <View style={styles.chips}>
          {ADVENTURE_FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              selected={adventure === f.value}
              onPress={() => setAdventure(f.value)}
              testID={`filter-adv-${f.value}`}
            />
          ))}
        </View>
        <View style={styles.chips}>
          <Chip
            label={sort === 'match' ? 'Sorted by best match' : 'Sort by best match'}
          selected={sort === 'match'}
          onPress={() => setSort(sort === 'match' ? 'menu' : 'match')}
            testID="sort-toggle"
          />
        </View>
      </View>

      <View style={{ gap: space.lg }} testID="menu-list">
        {dishes.length === 0 ? (
          <Text style={type.body} testID="menu-empty">
            This menu has no dishes yet.
          </Text>
        ) : shown.length === 0 ? (
          <Text style={type.body} testID="menu-empty-filtered">
            No dishes match these filters. Try "Any heat" or "Anything".
          </Text>
        ) : (
          shown.map((d) => (
            <DishCard
              key={d.id}
              dish={d}
              variant={variant}
              inOrder={lines.find((l) => l.dishId === d.id)?.qty ?? 0}
              onAdd={() => addToShortlist(restaurant.id, d)}
              onFeedback={() =>
                router.push({ pathname: '/feedback/[dishId]', params: { dishId: d.id, restaurantId: restaurant.id } })
              }
            />
          ))
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  controls: { gap: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
