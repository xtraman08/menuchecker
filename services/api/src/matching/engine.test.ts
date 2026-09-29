import { describe, expect, it } from 'vitest';
import type { TasteProfile } from '@fare/shared';
import {
  computeMatch,
  dietaryConflicts,
  ingredientFit,
  likedRateFit,
  matchStateFor,
  spiceFit,
  type MatchDishInput,
} from './engine';

const profile = (p: Partial<TasteProfile> = {}): TasteProfile => ({
  dietaryRestrictions: [],
  spiceTolerance: 2,
  avoidedIngredients: [],
  favoriteIngredients: [],
  cuisinesTried: [],
  ...p,
});

const dish = (d: Partial<MatchDishInput> = {}): MatchDishInput => ({
  spice: 2,
  ingredients: ['lentils', 'berbere', 'onion'],
  dietaryTags: ['vegan', 'gluten_free'],
  feedbackCount: 5,
  likedCount: 0,
  dislikedCount: 0,
  ...d,
});

describe('matchStateFor', () => {
  it('is unrated without a profile regardless of feedback', () => {
    expect(matchStateFor(false, 0)).toBe('unrated');
    expect(matchStateFor(false, 100)).toBe('unrated');
  });
  it('uses the 3 / 10 thresholds at their boundaries', () => {
    expect(matchStateFor(true, 0)).toBe('unrated');
    expect(matchStateFor(true, 2)).toBe('unrated');
    expect(matchStateFor(true, 3)).toBe('preliminary');
    expect(matchStateFor(true, 9)).toBe('preliminary');
    expect(matchStateFor(true, 10)).toBe('confident');
    expect(matchStateFor(true, 50)).toBe('confident');
  });
});

describe('computeMatch — unrated', () => {
  it('returns a null score and no explanation with no profile', () => {
    expect(computeMatch(null, dish({ feedbackCount: 20 }))).toEqual({
      matchScore: null,
      matchState: 'unrated',
      explanation: null,
    });
  });
  it('returns a null score below the feedback threshold even with a profile', () => {
    const r = computeMatch(profile(), dish({ feedbackCount: 2 }));
    expect(r.matchScore).toBeNull();
    expect(r.matchState).toBe('unrated');
  });
  it('never returns a number while unrated, even with a dietary conflict', () => {
    const r = computeMatch(
      profile({ dietaryRestrictions: ['vegan'] }),
      dish({ dietaryTags: [], feedbackCount: 0 }),
    );
    expect(r.matchScore).toBeNull();
    expect(r.matchState).toBe('unrated');
    expect(r.explanation).toMatch(/Not marked vegan/);
  });
});

describe('computeMatch — dietary hard filter', () => {
  it('scores 0 with an explanation when a restriction is not satisfied', () => {
    const r = computeMatch(
      profile({ dietaryRestrictions: ['vegetarian'] }),
      dish({ dietaryTags: ['gluten_free'] }),
    );
    expect(r).toEqual({
      matchScore: 0,
      matchState: 'preliminary',
      explanation: 'Not marked vegetarian — check with the restaurant.',
    });
  });
  it('lists every conflicting restriction', () => {
    const r = computeMatch(
      profile({ dietaryRestrictions: ['vegan', 'gluten_free', 'nut_free'] }),
      dish({ dietaryTags: ['vegetarian'], feedbackCount: 12 }),
    );
    expect(r.matchScore).toBe(0);
    expect(r.matchState).toBe('confident');
    expect(r.explanation).toBe(
      'Not marked vegan, gluten-free and nut-free — check with the restaurant.',
    );
  });
  it('overrides an otherwise perfect score', () => {
    const r = computeMatch(
      profile({ dietaryRestrictions: ['halal'], favoriteIngredients: ['lentils'] }),
      dish({ dietaryTags: ['vegan'], likedCount: 10, feedbackCount: 10 }),
    );
    expect(r.matchScore).toBe(0);
  });
  it('honours implications (vegan satisfies vegetarian / dairy-free / pork-free)', () => {
    expect(
      dietaryConflicts(['vegetarian', 'dairy_free', 'no_pork', 'pescatarian'], ['vegan']),
    ).toEqual([]);
    expect(dietaryConflicts(['vegan'], ['vegetarian'])).toEqual(['vegan']);
    expect(dietaryConflicts(['no_pork'], ['halal'])).toEqual([]);
    expect(dietaryConflicts(['shellfish_free'], ['kosher'])).toEqual([]);
    expect(dietaryConflicts(['no_beef'], ['pescatarian'])).toEqual([]);
    expect(dietaryConflicts(['gluten_free'], ['vegan'])).toEqual(['gluten_free']);
  });
  it('dedupes restrictions and passes with none', () => {
    expect(dietaryConflicts(['vegan', 'vegan'], [])).toEqual(['vegan']);
    expect(dietaryConflicts([], [])).toEqual([]);
  });
});

describe('spiceFit', () => {
  it('is 1 at tolerance', () => {
    for (let t = 0; t <= 3; t++) expect(spiceFit(t, t)).toBe(1);
  });
  it('drops steeply above tolerance and clamps at 0', () => {
    expect(spiceFit(1, 0)).toBeCloseTo(0.55);
    expect(spiceFit(2, 0)).toBeCloseTo(0.1);
    expect(spiceFit(3, 0)).toBe(0);
  });
  it('drops gently below tolerance', () => {
    expect(spiceFit(0, 3)).toBeCloseTo(0.7);
    expect(spiceFit(2, 3)).toBeCloseTo(0.9);
  });
});

describe('ingredientFit', () => {
  it('is neutral with no hits', () => {
    expect(ingredientFit(['rice'], profile()).fit).toBe(0.5);
  });
  it('rewards favourites and penalises avoided, case/partial-insensitively', () => {
    const r = ingredientFit(
      ['Minced Beef', 'chickpeas'],
      profile({ favoriteIngredients: ['beef', 'Chickpea'] }),
    );
    expect(r.favoriteHits).toEqual(['beef', 'chickpea']);
    expect(r.fit).toBe(1);
    const a = ingredientFit(['cilantro', 'lamb'], profile({ avoidedIngredients: ['cilantro'] }));
    expect(a.avoidedHits).toEqual(['cilantro']);
    expect(a.fit).toBe(0);
  });
  it('balances a favourite against an avoided ingredient', () => {
    const r = ingredientFit(
      ['lamb', 'mint'],
      profile({ favoriteIngredients: ['lamb'], avoidedIngredients: ['mint'] }),
    );
    expect(r.fit).toBeCloseTo(0.25);
  });
  it('ignores blank terms', () => {
    expect(ingredientFit(['rice'], profile({ favoriteIngredients: ['  '] })).favoriteHits).toEqual(
      [],
    );
  });
});

describe('likedRateFit', () => {
  it('is 0.5 with no ratings (smoothed prior)', () => {
    expect(likedRateFit(0, 0, null)).toBe(0.5);
  });
  it('tracks the aggregate liked-rate with smoothing', () => {
    expect(likedRateFit(8, 0, null)).toBeCloseTo(0.9);
    expect(likedRateFit(0, 8, null)).toBeCloseTo(0.1);
  });
  it("blends in the diner's own rating", () => {
    expect(likedRateFit(0, 0, true)).toBeCloseTo(0.75);
    expect(likedRateFit(0, 0, false)).toBeCloseTo(0.25);
  });
});

describe('computeMatch — weighted score', () => {
  it('computes the weighted blend (35/35/30) as an integer 0–100', () => {
    // spice 1, ingredients 0.75 (one favourite), liked (4+1)/(4+0+2)=0.8333
    const r = computeMatch(profile({ favoriteIngredients: ['lentils'] }), dish({ likedCount: 4 }));
    expect(r.matchScore).toBe(Math.round((0.35 * 1 + 0.35 * 0.75 + 0.3 * (5 / 6)) * 100));
    expect(r.matchState).toBe('preliminary');
    expect(r.explanation).toBe('Has lentils, which you like.');
  });
  it('scores a spicy, avoided, disliked dish low and explains why', () => {
    const r = computeMatch(
      profile({ spiceTolerance: 0, avoidedIngredients: ['onion'] }),
      dish({ spice: 3, dislikedCount: 10, feedbackCount: 10 }),
    );
    expect(r.matchScore).toBeLessThan(10);
    expect(r.matchState).toBe('confident');
    expect(r.explanation).toBe('Contains onion, which you avoid. Spicier than you usually like.');
  });
  it('stays within 0..100 across the input space', () => {
    for (let spice = 0; spice <= 3; spice++)
      for (let tol = 0; tol <= 3; tol++)
        for (const liked of [0, 5, 50])
          for (const own of [null, true, false]) {
            const r = computeMatch(
              profile({ spiceTolerance: tol }),
              dish({ spice, likedCount: liked }),
              own,
            );
            expect(Number.isInteger(r.matchScore)).toBe(true);
            expect(r.matchScore!).toBeGreaterThanOrEqual(0);
            expect(r.matchScore!).toBeLessThanOrEqual(100);
          }
  });
  it('returns null explanation when there is nothing notable', () => {
    expect(computeMatch(profile(), dish()).explanation).toBeNull();
  });
});
