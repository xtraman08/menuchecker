import { z } from 'zod';
import {
  confidenceSchema,
  dietaryRestrictionSchema,
  dishSourceSchema,
  matchExplanationKindSchema,
  matchStateSchema,
  menuSourceSchema,
  parseConfidenceSchema,
} from './enums';

// Reusable primitives ---------------------------------------------------------

const trimmed = (max: number) => z.string().trim().min(1).max(max);
const price = z.string().trim().max(32).nullable();
// z.guid(): any 8-4-4-4-12 hex id (seed data may use non-v4 ids).
const uuid = z.guid();
const isoDate = z.iso.datetime({ offset: true });
const tagList = z.array(z.string().trim().toLowerCase().min(1).max(60)).max(30);

// Errors & auth ---------------------------------------------------------------

export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'UPSTREAM_ERROR',
  'INTERNAL',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  error: z.object({ code: errorCodeSchema, message: z.string() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export const authResponseSchema = z.object({ token: z.string(), userId: uuid });
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const healthResponseSchema = z.object({ ok: z.literal(true) });
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// Scan / parse ----------------------------------------------------------------

export const restaurantGuessSchema = z.object({
  name: trimmed(120),
  cuisine: trimmed(60),
});
export type RestaurantGuess = z.infer<typeof restaurantGuessSchema>;

export const parsedDishSchema = z.object({
  tempId: trimmed(64),
  nativeName: trimmed(120),
  price,
  rawText: z.string().max(1000),
  confidence: parseConfidenceSchema,
});
export type ParsedDish = z.infer<typeof parsedDishSchema>;

/** What `llm.parseMenuImage` returns. */
export const parsedMenuSchema = z.object({
  restaurantGuess: restaurantGuessSchema.optional(),
  dishes: z.array(parsedDishSchema).max(200),
});
export type ParsedMenu = z.infer<typeof parsedMenuSchema>;

export const scanResponseSchema = parsedMenuSchema.extend({ scanId: uuid });
export type ScanResponse = z.infer<typeof scanResponseSchema>;

// Decode ----------------------------------------------------------------------

/** One decoded dish as produced by `llm.decodeDishes` (same order as the input). */
export const decodedDishSchema = z.object({
  anchor: trimmed(200),
  description: trimmed(600),
  spice: z.number().int().min(0).max(3),
  texture: trimmed(60),
  adventurousness: z.number().int().min(1).max(3),
  note: z.string().trim().max(200).nullable(),
  ingredients: tagList,
  dietaryTags: z.array(dietaryRestrictionSchema).max(11),
  /** `low` when the model doesn't recognise the dish; saved as the dish's confidence. */
  confidence: confidenceSchema,
});
export type DecodedDish = z.infer<typeof decodedDishSchema>;

export const decodeInputSchema = z.object({
  cuisine: trimmed(60),
  restaurantName: trimmed(120),
  dishes: z
    .array(
      z.object({
        nativeName: trimmed(120),
        price,
        rawText: z.string().max(1000).optional(),
      }),
    )
    .min(1)
    .max(200),
});
export type DecodeInput = z.infer<typeof decodeInputSchema>;

// Restaurants -----------------------------------------------------------------

/** A dish after the diner reviewed/edited the parse result (or typed it manually). */
export const reviewedDishSchema = z.object({
  nativeName: trimmed(120),
  price,
  rawText: z.string().max(1000).optional(),
  confidence: parseConfidenceSchema.default('manual'),
});
export type ReviewedDish = z.infer<typeof reviewedDishSchema>;
export type ReviewedDishInput = z.input<typeof reviewedDishSchema>;

export const createRestaurantRequestSchema = z.object({
  name: trimmed(120),
  address: z.string().trim().max(200).nullable().optional(),
  cuisine: trimmed(60),
  source: menuSourceSchema.default('scan'),
  dishes: z.array(reviewedDishSchema).min(1).max(200),
});
export type CreateRestaurantRequest = z.infer<typeof createRestaurantRequestSchema>;
export type CreateRestaurantRequestInput = z.input<typeof createRestaurantRequestSchema>;

export const restaurantSchema = z.object({
  id: uuid,
  name: z.string(),
  address: z.string().nullable(),
  cuisine: z.string(),
  createdBy: uuid,
  createdAt: isoDate,
});
export type Restaurant = z.infer<typeof restaurantSchema>;

export const restaurantSummarySchema = z.object({
  id: uuid,
  name: z.string(),
  address: z.string().nullable(),
  cuisine: z.string(),
  dishCount: z.number().int().nonnegative(),
  createdAt: isoDate,
});
export type RestaurantSummary = z.infer<typeof restaurantSummarySchema>;

export const listRestaurantsQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});
export type ListRestaurantsQuery = z.infer<typeof listRestaurantsQuerySchema>;

// Dish card -------------------------------------------------------------------

export const dishCardSchema = z.object({
  id: uuid,
  nativeName: z.string(),
  photoUrl: z.string().nullable(),
  anchor: z.string(),
  description: z.string(),
  spice: z.number().int().min(0).max(3),
  texture: z.string(),
  adventurousness: z.number().int().min(1).max(3),
  note: z.string().nullable(),
  price: z.string().nullable(),
  source: dishSourceSchema,
  confidence: confidenceSchema,
  /** 0-100, always null when matchState is `unrated`. */
  matchScore: z.number().int().min(0).max(100).nullable(),
  matchState: matchStateSchema,
  /** Plain-language reason for the match (e.g. dietary conflict); null when nothing to say. */
  matchExplanation: z.string().nullable(),
  /** Structured reason behind matchExplanation; null when there is no explanation. */
  matchExplanationKind: matchExplanationKindSchema.nullable(),
  /** Diets the dish is marked as suitable for (AI-generated: verify with the restaurant). */
  dietaryTags: z.array(dietaryRestrictionSchema),
  feedbackUp: z.number().int().nonnegative(),
  feedbackDown: z.number().int().nonnegative(),
});
export type DishCard = z.infer<typeof dishCardSchema>;

export const createRestaurantResponseSchema = z.object({
  restaurant: restaurantSchema,
  menuId: uuid,
  dishes: z.array(dishCardSchema),
});
export type CreateRestaurantResponse = z.infer<typeof createRestaurantResponseSchema>;

export const restaurantDetailSchema = z.object({
  restaurant: restaurantSchema,
  dishes: z.array(dishCardSchema),
});
export type RestaurantDetail = z.infer<typeof restaurantDetailSchema>;

// Feedback --------------------------------------------------------------------

export const feedbackRequestSchema = z
  .object({
    accurate: z.boolean().optional(),
    tastesLike: z.string().trim().min(1).max(200).optional(),
    liked: z.boolean().optional(),
  })
  .refine((v) => v.accurate !== undefined || v.tastesLike !== undefined || v.liked !== undefined, {
    message: 'Provide at least one of accurate, tastesLike, liked',
  });
export type FeedbackRequest = z.infer<typeof feedbackRequestSchema>;

export const feedbackResponseSchema = z.object({ dish: dishCardSchema });
export type FeedbackResponse = z.infer<typeof feedbackResponseSchema>;

// Taste profile ---------------------------------------------------------------

export const tasteProfileSchema = z.object({
  dietaryRestrictions: z.array(dietaryRestrictionSchema).max(11),
  spiceTolerance: z.number().int().min(0).max(3),
  avoidedIngredients: tagList,
  favoriteIngredients: tagList,
  cuisinesTried: z.array(z.string().trim().min(1).max(60)).max(50),
});
export type TasteProfile = z.infer<typeof tasteProfileSchema>;

export const idParamSchema = z.object({ id: uuid });
