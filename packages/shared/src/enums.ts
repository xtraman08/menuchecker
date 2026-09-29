import { z } from 'zod';

/** Confidence of AI-generated dish content. */
export const confidenceSchema = z.enum(['high', 'low']);
export type Confidence = z.infer<typeof confidenceSchema>;

/** Confidence of a parsed menu line; `manual` = the diner typed it. UI: Looks good / Check this / Manual entry. */
export const parseConfidenceSchema = z.enum(['high', 'low', 'manual']);
export type ParseConfidence = z.infer<typeof parseConfidenceSchema>;

export const dishSourceSchema = z.enum(['ai_generated', 'diner_refined', 'restaurant_verified']);
export type DishSource = z.infer<typeof dishSourceSchema>;

export const menuSourceSchema = z.enum(['scan', 'manual']);
export type MenuSource = z.infer<typeof menuSourceSchema>;

export const matchStateSchema = z.enum(['unrated', 'preliminary', 'confident']);
export type MatchState = z.infer<typeof matchStateSchema>;

/**
 * What `matchExplanation` is about. `dietary` = the dish isn't marked as meeting one of the
 * diner's dietary restrictions (show the "verify with the restaurant" caveat). `feedback` is
 * reserved for later; the MVP engine never emits it.
 */
export const matchExplanationKindSchema = z.enum(['dietary', 'ingredients', 'spice', 'feedback']);
export type MatchExplanationKind = z.infer<typeof matchExplanationKindSchema>;

/**
 * Canonical dietary vocabulary. Used both for a diner's `dietaryRestrictions`
 * and for a dish's `dietaryTags` (tags assert the dish IS compatible, e.g. a
 * dish tagged `vegan` is suitable for a vegan diner).
 */
export const DIETARY_RESTRICTIONS = [
  'vegetarian',
  'vegan',
  'pescatarian',
  'gluten_free',
  'dairy_free',
  'nut_free',
  'shellfish_free',
  'halal',
  'kosher',
  'no_pork',
  'no_beef',
] as const;
export const dietaryRestrictionSchema = z.enum(DIETARY_RESTRICTIONS);
export type DietaryRestriction = z.infer<typeof dietaryRestrictionSchema>;
