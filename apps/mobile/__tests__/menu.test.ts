import type { DishCard } from '@/api/types';
import { visibleDishes } from '@/lib/menu';
import { parsePrice, totalOf } from '@/lib/price';
import { addDish, summarize } from '@/state/shortlist';

const dish = (id: string, over: Partial<DishCard> = {}): DishCard => ({
  id,
  nativeName: id,
  photoUrl: null,
  anchor: 'Similar to x — y',
  description: 'desc',
  spice: 0,
  texture: '',
  adventurousness: 1,
  note: null,
  price: null,
  source: 'ai_generated',
  confidence: 'high',
  matchScore: null,
  matchState: 'unrated',
  matchExplanation: null,
  matchExplanationKind: null,
  dietaryTags: [],
  feedbackUp: 0,
  feedbackDown: 0,
  ...over,
});

describe('prices', () => {
  it.each([
    ['$14', 14],
    ['14.50', 14.5],
    ['ETB 250', 250],
    ['12,50 €', 12.5],
    ['1,200', 1200],
    ['MP', null],
    [null, null],
  ])('parses %p', (input, expected) => {
    expect(parsePrice(input)).toBe(expected);
  });

  it('totals with the first priced item’s currency style and counts unpriced items', () => {
    expect(totalOf(['$14', null, '$3.50'])).toEqual({ amount: 17.5, label: '$17.50', unpriced: 1 });
    expect(totalOf(['ETB 250', 'ETB 100']).label).toBe('ETB 350');
  });
});

describe('shortlist', () => {
  it('accumulates quantities and totals', () => {
    let s = addDish({}, 'r1', dish('a', { price: '$10' }));
    s = addDish(s, 'r1', dish('a', { price: '$10' }));
    s = addDish(s, 'r1', dish('b', { price: '$4' }));
    expect(s.r1).toHaveLength(2);
    expect(summarize(s.r1!)).toMatchObject({ count: 3, label: '$24' });
  });
});

describe('visibleDishes', () => {
  const dishes = [
    dish('mild', { spice: 1, matchScore: 40, matchState: 'preliminary' }),
    dish('hot', { spice: 3, adventurousness: 3, matchScore: 90, matchState: 'confident' }),
    dish('none', { spice: 0 }),
  ];

  it('keeps menu order by default', () => {
    expect(
      visibleDishes(dishes, { spice: 'any', adventure: 'any', sort: 'menu' }).map((d) => d.id),
    ).toEqual(['mild', 'hot', 'none']);
  });

  it('sorts by match only when asked, unrated last', () => {
    expect(
      visibleDishes(dishes, { spice: 'any', adventure: 'any', sort: 'match' }).map((d) => d.id),
    ).toEqual(['hot', 'mild', 'none']);
  });

  it('filters by spice and adventurousness', () => {
    expect(
      visibleDishes(dishes, { spice: 'mild', adventure: 'any', sort: 'menu' }).map((d) => d.id),
    ).toEqual(['mild', 'none']);
    expect(
      visibleDishes(dishes, { spice: 'any', adventure: 'adventurous', sort: 'menu' }).map(
        (d) => d.id,
      ),
    ).toEqual(['hot']);
  });
});
