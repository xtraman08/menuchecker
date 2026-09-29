import {
  DIETARY_IMPLIES,
  DIETARY_LABELS,
  MATCH_CONFIG,
  type DietaryRestriction,
  type MatchState,
  type TasteProfile,
} from '@fare/shared';

export interface MatchDishInput {
  spice: number;
  ingredients: readonly string[];
  dietaryTags: readonly DietaryRestriction[];
  /** Total dish_feedback entries for this dish, all diners. */
  feedbackCount: number;
  /** Entries with liked = true / false, all diners. */
  likedCount: number;
  dislikedCount: number;
}

export interface MatchResult {
  matchScore: number | null;
  matchState: MatchState;
  explanation: string | null;
}

export interface MatchBreakdown {
  spice: number;
  ingredients: number;
  likedRate: number;
  favoriteHits: string[];
  avoidedHits: string[];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const norm = (s: string) => s.trim().toLowerCase();

/** Diner restrictions the dish is not tagged as satisfying (directly or by implication). */
export function dietaryConflicts(
  restrictions: readonly DietaryRestriction[],
  dishTags: readonly DietaryRestriction[],
): DietaryRestriction[] {
  const satisfied = new Set<DietaryRestriction>();
  for (const tag of dishTags) {
    satisfied.add(tag);
    for (const implied of DIETARY_IMPLIES[tag]) satisfied.add(implied);
  }
  return [...new Set(restrictions)].filter((r) => !satisfied.has(r));
}

/** 1 = perfect fit; penalised per level above (steeply) or below (gently) the diner's tolerance. */
export function spiceFit(dishSpice: number, tolerance: number): number {
  const diff = dishSpice - tolerance;
  const { penaltyPerLevelAbove, penaltyPerLevelBelow } = MATCH_CONFIG.spice;
  return clamp01(1 - (diff > 0 ? diff * penaltyPerLevelAbove : -diff * penaltyPerLevelBelow));
}

/** Word-ish containment either way, so "beef" matches "minced beef" and "chickpeas" matches "chickpea". */
function ingredientMatches(dishIngredient: string, term: string): boolean {
  const a = norm(dishIngredient);
  const b = norm(term);
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
}

function hits(ingredients: readonly string[], terms: readonly string[]): string[] {
  return [...new Set(terms.map(norm))].filter((t) => ingredients.some((i) => ingredientMatches(i, t)));
}

export function ingredientFit(ingredients: readonly string[], profile: TasteProfile) {
  const favoriteHits = hits(ingredients, profile.favoriteIngredients);
  const avoidedHits = hits(ingredients, profile.avoidedIngredients);
  const { neutral, bonusPerFavorite, penaltyPerAvoided } = MATCH_CONFIG.ingredients;
  const fit = clamp01(
    neutral + favoriteHits.length * bonusPerFavorite - avoidedHits.length * penaltyPerAvoided,
  );
  return { fit, favoriteHits, avoidedHits };
}

export function likedRateFit(likedCount: number, dislikedCount: number, ownLiked: boolean | null): number {
  const { priorLiked, priorDisliked, ownRatingWeight } = MATCH_CONFIG.likedRate;
  const aggregate = (likedCount + priorLiked) / (likedCount + dislikedCount + priorLiked + priorDisliked);
  if (ownLiked === null) return aggregate;
  return (1 - ownRatingWeight) * aggregate + ownRatingWeight * (ownLiked ? 1 : 0);
}

export function matchStateFor(hasProfile: boolean, feedbackCount: number): MatchState {
  const { preliminary, confident } = MATCH_CONFIG.thresholds;
  if (!hasProfile || feedbackCount < preliminary) return 'unrated';
  return feedbackCount >= confident ? 'confident' : 'preliminary';
}

function formatList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function explain(breakdown: MatchBreakdown, profile: TasteProfile, dishSpice: number): string | null {
  const parts: string[] = [];
  if (breakdown.avoidedHits.length) parts.push(`Contains ${formatList(breakdown.avoidedHits)}, which you avoid`);
  if (breakdown.favoriteHits.length) parts.push(`Has ${formatList(breakdown.favoriteHits)}, which you like`);
  if (dishSpice > profile.spiceTolerance) parts.push('Spicier than you usually like');
  return parts.length ? `${parts.join('. ')}.` : null;
}

/**
 * Pure per-diner, per-dish match score. `profile === null` means the diner has
 * no taste profile yet. The score is null whenever the state is `unrated`.
 */
export function computeMatch(
  profile: TasteProfile | null,
  dish: MatchDishInput,
  ownLiked: boolean | null = null,
): MatchResult {
  const matchState = matchStateFor(profile !== null, dish.feedbackCount);
  if (!profile) return { matchScore: null, matchState, explanation: null };

  const conflicts = dietaryConflicts(profile.dietaryRestrictions, dish.dietaryTags);
  if (conflicts.length) {
    const labels = conflicts.map((c) => DIETARY_LABELS[c]);
    return {
      matchScore: matchState === 'unrated' ? null : 0,
      matchState,
      explanation: `Not marked ${formatList(labels)} — check with the restaurant.`,
    };
  }

  const ing = ingredientFit(dish.ingredients, profile);
  const breakdown: MatchBreakdown = {
    spice: spiceFit(dish.spice, profile.spiceTolerance),
    ingredients: ing.fit,
    likedRate: likedRateFit(dish.likedCount, dish.dislikedCount, ownLiked),
    favoriteHits: ing.favoriteHits,
    avoidedHits: ing.avoidedHits,
  };
  const explanation = explain(breakdown, profile, dish.spice);
  if (matchState === 'unrated') return { matchScore: null, matchState, explanation };

  const w = MATCH_CONFIG.weights;
  const raw = w.spice * breakdown.spice + w.ingredients * breakdown.ingredients + w.likedRate * breakdown.likedRate;
  return { matchScore: Math.round(clamp01(raw) * 100), matchState, explanation };
}
