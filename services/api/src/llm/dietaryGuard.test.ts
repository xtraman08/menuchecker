import { describe, expect, it } from 'vitest';
import { guardDietaryTags } from './dietaryGuard.js';

describe('guardDietaryTags', () => {
  it('drops gluten_free when the dish is served with injera', () => {
    const r = guardDietaryTags(
      ['gluten_free', 'no_pork'],
      ['beef', 'mitmita', 'niter kibbeh', 'injera'],
    );
    expect(r.tags).toEqual(['no_pork']);
    expect(r.dropped).toEqual(['gluten_free']);
  });

  it('drops vegan and dairy_free when butter or niter kibbeh is listed', () => {
    const r = guardDietaryTags(['vegan', 'vegetarian', 'dairy_free'], ['lentils', 'niter kibbeh']);
    expect(r.tags).toEqual(['vegetarian']);
  });

  it('drops diet tags contradicted by meat, seafood, pork or beef', () => {
    expect(guardDietaryTags(['vegetarian', 'pescatarian'], ['chicken', 'egg']).tags).toEqual([]);
    expect(guardDietaryTags(['shellfish_free', 'pescatarian'], ['shrimp']).tags).toEqual([
      'pescatarian',
    ]);
    expect(guardDietaryTags(['no_pork', 'halal'], ['smoked bacon']).tags).toEqual([]);
    expect(guardDietaryTags(['no_beef'], ['minced beef']).tags).toEqual([]);
  });

  it('keeps tags when plant-based or gluten-free qualifiers apply', () => {
    const r = guardDietaryTags(
      ['vegan', 'dairy_free', 'gluten_free'],
      ['chickpea flour', 'coconut milk', 'rice noodles', 'corn tortilla', 'eggplant'],
    );
    expect(r.tags).toEqual(['vegan', 'dairy_free', 'gluten_free']);
  });

  it('matches whole words only', () => {
    // "coconut" is not "nut", "eggplant" is not "egg", "nutmeg" is not "nut".
    expect(guardDietaryTags(['nut_free', 'vegan'], ['coconut', 'eggplant', 'nutmeg']).tags).toEqual(
      ['nut_free', 'vegan'],
    );
    expect(guardDietaryTags(['nut_free'], ['peanut butter']).tags).toEqual([]);
  });

  it('dedupes tags and never adds any', () => {
    expect(guardDietaryTags(['vegan', 'vegan'], []).tags).toEqual(['vegan']);
    expect(guardDietaryTags([], ['tofu']).tags).toEqual([]);
  });
});
