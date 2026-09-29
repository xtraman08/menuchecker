// Pure shortlist logic, kept separate from React so it can be unit-tested.
import type { DishCard } from '@/api/types';
import { totalOf, type Total } from '@/lib/price';

export interface ShortlistLine {
  dishId: string;
  nativeName: string;
  price: string | null;
  qty: number;
}

/** Shortlists are per restaurant: restaurantId → lines. */
export type Shortlists = Record<string, ShortlistLine[]>;

export function addDish(state: Shortlists, restaurantId: string, dish: DishCard): Shortlists {
  const lines = state[restaurantId] ?? [];
  const existing = lines.find((l) => l.dishId === dish.id);
  const next = existing
    ? lines.map((l) => (l.dishId === dish.id ? { ...l, qty: l.qty + 1 } : l))
    : [...lines, { dishId: dish.id, nativeName: dish.nativeName, price: dish.price, qty: 1 }];
  return { ...state, [restaurantId]: next };
}

export function clearRestaurant(state: Shortlists, restaurantId: string): Shortlists {
  const { [restaurantId]: _removed, ...rest } = state;
  return rest;
}

export function summarize(lines: ShortlistLine[]): Total & { count: number } {
  const prices = lines.flatMap((l) => Array<string | null>(l.qty).fill(l.price));
  return { ...totalOf(prices), count: prices.length };
}
