// Row shapes returned by the repositories (camelCase; timestamps are Date).
import type {
  Confidence,
  DietaryRestriction,
  DishSource,
  MatchExplanationKind,
  MatchState,
  MenuSource,
} from '@fare/shared';

export interface UserRow {
  id: string;
  createdAt: Date;
}

export interface RestaurantRow {
  id: string;
  name: string;
  address: string | null;
  cuisine: string;
  createdBy: string;
  createdAt: Date;
}

export interface RestaurantSummaryRow {
  id: string;
  name: string;
  address: string | null;
  cuisine: string;
  dishCount: number;
  createdAt: Date;
}

export interface MenuRow {
  id: string;
  restaurantId: string;
  source: MenuSource;
  createdBy: string;
  createdAt: Date;
}

/** Decoded fields are null until the AI decode pass has run (decodedAt set). */
export interface DishRow {
  id: string;
  menuId: string;
  position: number;
  nativeName: string;
  price: string | null;
  rawText: string | null;
  anchor: string | null;
  description: string | null;
  spice: number | null;
  texture: string | null;
  adventurousness: number | null;
  note: string | null;
  photoUrl: string | null;
  ingredients: string[];
  dietaryTags: DietaryRestriction[];
  source: DishSource;
  confidence: Confidence;
  feedbackUp: number;
  feedbackDown: number;
  decodedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A dish plus the current diner's cached match (unrated when none cached). */
export interface DishWithMatchRow extends DishRow {
  restaurantId: string;
  matchScore: number | null;
  matchState: MatchState;
  matchExplanation: string | null;
  matchExplanationKind: MatchExplanationKind | null;
  /** False when no dish_matches row is cached for this diner (needs computing). */
  matchCached: boolean;
}

/** A dish to insert; pass the decoded fields too when decode ran before saving. */
export interface NewDish {
  nativeName: string;
  price: string | null;
  rawText?: string | null;
  confidence?: Confidence;
  photoUrl?: string | null;
  anchor?: string | null;
  description?: string | null;
  spice?: number | null;
  texture?: string | null;
  adventurousness?: number | null;
  note?: string | null;
  ingredients?: string[];
  dietaryTags?: DietaryRestriction[];
}

export interface FeedbackRow {
  id: string;
  dishId: string;
  userId: string;
  accurate: boolean | null;
  tastesLike: string | null;
  liked: boolean | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Aggregate over all diners for one dish. likedRate is null when nobody rated liked/not. */
export interface FeedbackStats {
  entries: number;
  accurateUp: number;
  accurateDown: number;
  likedUp: number;
  likedDown: number;
  likedRate: number | null;
}

export interface TasteProfileRow {
  id: string;
  userId: string;
  dietaryRestrictions: DietaryRestriction[];
  spiceTolerance: number;
  avoidedIngredients: string[];
  favoriteIngredients: string[];
  cuisinesTried: string[];
  updatedAt: Date;
}

export interface MatchRow {
  dishId: string;
  userId: string;
  matchScore: number | null;
  matchState: MatchState;
  explanation: string | null;
  explanationKind: MatchExplanationKind | null;
  computedAt: Date;
}

export interface MatchInput {
  dishId: string;
  matchScore: number | null;
  matchState: MatchState;
  explanation: string | null;
  /** Optional until ports.CachedMatch makes it required; stored as null when omitted. */
  explanationKind?: MatchExplanationKind | null;
}
