// What the HTTP layer needs from the db and llm modules. Routes depend only on
// these interfaces so tests can inject fakes; src/deps.ts wires the real ones.
import type {
  DietaryRestriction,
  DishSource,
  Confidence,
  MatchState,
  MenuSource,
  Restaurant,
  RestaurantSummary,
  TasteProfile,
} from '@fare/shared';
import type { decodeDishes, parseMenuImage } from './llm/index.js';

export interface LlmPort {
  parseMenuImage: typeof parseMenuImage;
  decodeDishes: typeof decodeDishes;
}

export interface DishRecord {
  id: string;
  nativeName: string;
  price: string | null;
  photoUrl: string | null;
  /** Decoded fields; null until the decode pass has run. */
  anchor: string | null;
  description: string | null;
  spice: number | null;
  texture: string | null;
  adventurousness: number | null;
  note: string | null;
  ingredients: string[];
  dietaryTags: DietaryRestriction[];
  source: DishSource;
  confidence: Confidence;
  feedbackUp: number;
  feedbackDown: number;
}

export interface NewDish {
  nativeName: string;
  price: string | null;
  rawText: string | null;
  anchor: string;
  description: string;
  spice: number;
  texture: string;
  adventurousness: number;
  note: string | null;
  ingredients: string[];
  dietaryTags: DietaryRestriction[];
  confidence: Confidence;
}

export interface FeedbackStats {
  entries: number;
  likedUp: number;
  likedDown: number;
}

export interface CachedMatch {
  dishId: string;
  matchScore: number | null;
  matchState: MatchState;
  explanation: string | null;
}

/** Repositories scoped to one user's transaction (RLS applies). */
export interface UserTx {
  createRestaurant(input: { name: string; address: string | null; cuisine: string }): Promise<Restaurant>;
  listRestaurants(q?: string): Promise<RestaurantSummary[]>;
  getRestaurant(id: string): Promise<Restaurant | null>;
  createMenu(restaurantId: string, source: MenuSource): Promise<{ id: string }>;
  createDishes(menuId: string, dishes: NewDish[]): Promise<DishRecord[]>;
  /** Dishes of the restaurant's latest menu, in menu order. */
  listDishesForRestaurant(restaurantId: string): Promise<DishRecord[]>;
  getDish(id: string): Promise<DishRecord | null>;
  upsertFeedback(input: {
    dishId: string;
    accurate?: boolean;
    tastesLike?: string;
    liked?: boolean;
  }): Promise<void>;
  /** The current diner's liked rating per dish (absent = none). */
  ownLiked(dishIds: string[]): Promise<Map<string, boolean>>;
  feedbackStats(dishIds: string[]): Promise<Map<string, FeedbackStats>>;
  getTasteProfile(): Promise<TasteProfile | null>;
  upsertTasteProfile(profile: TasteProfile): Promise<TasteProfile>;
  getMatches(dishIds: string[]): Promise<Map<string, CachedMatch>>;
  upsertMatches(matches: CachedMatch[]): Promise<void>;
}

export interface DbPort {
  /** Creates an anonymous user row; returns its id. */
  createAnonymousUser(): Promise<string>;
  withUserTx<T>(userId: string, fn: (tx: UserTx) => Promise<T>): Promise<T>;
  /** Liveness of the pool (used by /health). */
  ping(): Promise<boolean>;
}

export interface Deps {
  db: DbPort;
  llm: LlmPort;
}
