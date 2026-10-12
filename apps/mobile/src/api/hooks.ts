import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import type { CreateRestaurantInput, FeedbackInput, RestaurantDetail, TasteProfile } from './types';

export const keys = {
  restaurants: (q: string) => ['restaurants', q] as const,
  restaurant: (id: string) => ['restaurant', id] as const,
  tasteProfile: ['tasteProfile'] as const,
};

export function useRestaurants(q: string) {
  return useQuery({
    queryKey: keys.restaurants(q),
    queryFn: () => api.listRestaurants(q || undefined),
  });
}

export function useRestaurant(id: string) {
  return useQuery({
    queryKey: keys.restaurant(id),
    queryFn: () => api.getRestaurant(id),
    enabled: !!id,
  });
}

export function useTasteProfile() {
  return useQuery({ queryKey: keys.tasteProfile, queryFn: () => api.getTasteProfile() });
}

export function useSaveTasteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: TasteProfile) => api.putTasteProfile(p),
    onSuccess: (p) => {
      qc.setQueryData(keys.tasteProfile, p);
      // Match scores are recomputed server-side on profile change.
      void qc.invalidateQueries({ queryKey: ['restaurant'] });
    },
  });
}

export function useCreateRestaurant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRestaurantInput) => api.createRestaurant(input),
    onSuccess: (res) => {
      qc.setQueryData<RestaurantDetail>(keys.restaurant(res.restaurant.id), {
        restaurant: res.restaurant,
        dishes: res.dishes,
      });
      void qc.invalidateQueries({ queryKey: ['restaurants'] });
    },
  });
}

export function useSendFeedback(restaurantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dishId, input }: { dishId: string; input: FeedbackInput }) =>
      api.sendFeedback(dishId, input),
    onSuccess: ({ dish }) => {
      qc.setQueryData<RestaurantDetail>(keys.restaurant(restaurantId), (old) =>
        old ? { ...old, dishes: old.dishes.map((d) => (d.id === dish.id ? dish : d)) } : old,
      );
    },
  });
}
