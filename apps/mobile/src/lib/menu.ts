import type { DishCard } from '@/api/types';
import { shouldShowScore } from './dish';

export type SpiceFilter = 'any' | 'none' | 'mild' | 'hot';
export type AdventureFilter = 'any' | 'familiar' | 'adventurous';
export type SortMode = 'menu' | 'match';

export const SPICE_FILTERS: { value: SpiceFilter; label: string }[] = [
  { value: 'any', label: 'Any heat' },
  { value: 'none', label: 'No heat' },
  { value: 'mild', label: 'Mild or less' },
  { value: 'hot', label: 'Spicy' },
];

export const ADVENTURE_FILTERS: { value: AdventureFilter; label: string }[] = [
  { value: 'any', label: 'Anything' },
  { value: 'familiar', label: 'Familiar' },
  { value: 'adventurous', label: 'Adventurous' },
];

function spiceOk(d: DishCard, f: SpiceFilter) {
  switch (f) {
    case 'any':
      return true;
    case 'none':
      return d.spice === 0;
    case 'mild':
      return d.spice <= 1;
    case 'hot':
      return d.spice >= 2;
  }
}

function adventureOk(d: DishCard, f: AdventureFilter) {
  if (f === 'familiar') return d.adventurousness <= 1;
  if (f === 'adventurous') return d.adventurousness >= 3;
  return true;
}

/**
 * Menu order is preserved unless the diner explicitly asks to sort by match
 * (docs/TEAM_PLAN.md). When sorting, dishes without a score go last in menu order.
 */
export function visibleDishes(
  dishes: DishCard[],
  opts: { spice: SpiceFilter; adventure: AdventureFilter; sort: SortMode },
): DishCard[] {
  const filtered = dishes.filter((d) => spiceOk(d, opts.spice) && adventureOk(d, opts.adventure));
  if (opts.sort === 'menu') return filtered;
  const score = (d: DishCard) => (shouldShowScore(d) ? d.matchScore! : -1);
  return filtered
    .map((d, i) => ({ d, i }))
    .sort((a, b) => score(b.d) - score(a.d) || a.i - b.i)
    .map(({ d }) => d);
}
