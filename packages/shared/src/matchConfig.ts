import type { DietaryRestriction } from './enums';

/**
 * Placeholder matching defaults (docs/TEAM_PLAN.md "Matching"). Every tunable
 * number for the MVP match score lives here so it can be changed in one place.
 */
export const MATCH_CONFIG = {
  /** Component weights; must sum to 1. */
  weights: {
    spice: 0.35,
    ingredients: 0.35,
    likedRate: 0.3,
  },

  /** Total dish_feedback entries (all diners) needed per state. Below `preliminary` => unrated. */
  thresholds: {
    preliminary: 3,
    confident: 10,
  },

  spice: {
    /** Fit lost per spice level the dish is ABOVE the diner's tolerance. */
    penaltyPerLevelAbove: 0.45,
    /** Fit lost per spice level the dish is BELOW the diner's tolerance. */
    penaltyPerLevelBelow: 0.1,
  },

  ingredients: {
    /** Fit with no favourite/avoided hits. */
    neutral: 0.5,
    bonusPerFavorite: 0.25,
    penaltyPerAvoided: 0.5,
  },

  likedRate: {
    /** Laplace smoothing prior on the aggregate liked-rate: (liked + a) / (total + a + b). */
    priorLiked: 1,
    priorDisliked: 1,
    /** Share of the liked component taken by the diner's own liked/not-for-me rating, when present. */
    ownRatingWeight: 0.5,
  },
} as const;

/**
 * A dish tag satisfies these diner restrictions too (a `vegan` dish is fine for
 * a vegetarian). Every tag trivially satisfies itself.
 */
export const DIETARY_IMPLIES: Readonly<Record<DietaryRestriction, readonly DietaryRestriction[]>> =
  {
    vegan: ['vegetarian', 'pescatarian', 'dairy_free', 'shellfish_free', 'no_pork', 'no_beef'],
    vegetarian: ['pescatarian', 'shellfish_free', 'no_pork', 'no_beef'],
    pescatarian: ['no_pork', 'no_beef'],
    gluten_free: [],
    dairy_free: [],
    nut_free: [],
    shellfish_free: [],
    halal: ['no_pork'],
    kosher: ['no_pork', 'shellfish_free'],
    no_pork: [],
    no_beef: [],
  };

/** Human labels for explanations and UI chips. */
export const DIETARY_LABELS: Readonly<Record<DietaryRestriction, string>> = {
  vegetarian: 'vegetarian',
  vegan: 'vegan',
  pescatarian: 'pescatarian',
  gluten_free: 'gluten-free',
  dairy_free: 'dairy-free',
  nut_free: 'nut-free',
  shellfish_free: 'shellfish-free',
  halal: 'halal',
  kosher: 'kosher',
  no_pork: 'pork-free',
  no_beef: 'beef-free',
};
