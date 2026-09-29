import type { DishCard } from '@fare/shared';
import type { CachedMatch, DishRecord, UserTx } from '../ports.js';
import { computeMatch } from './engine.js';

type DecodedDishRecord = DishRecord & {
  anchor: string;
  description: string;
  spice: number;
  texture: string;
  adventurousness: number;
};

/** Dishes whose decode pass hasn't run can't be shown as a card (no anchor to explain them). */
export function isDecoded(d: DishRecord): d is DecodedDishRecord {
  return (
    d.anchor !== null &&
    d.description !== null &&
    d.spice !== null &&
    d.texture !== null &&
    d.adventurousness !== null
  );
}

export function toDishCard(d: DecodedDishRecord, m: CachedMatch): DishCard {
  return {
    id: d.id,
    nativeName: d.nativeName,
    photoUrl: d.photoUrl,
    anchor: d.anchor,
    description: d.description,
    spice: d.spice,
    texture: d.texture,
    adventurousness: d.adventurousness,
    note: d.note,
    price: d.price,
    source: d.source,
    confidence: d.confidence,
    matchScore: m.matchState === 'unrated' ? null : m.matchScore,
    matchState: m.matchState,
    matchExplanation: m.explanation,
    feedbackUp: d.feedbackUp,
    feedbackDown: d.feedbackDown,
  };
}

/**
 * Builds cards with the current diner's match fields. Cached `dish_matches`
 * rows are reused; rows missing (never computed, or invalidated by the DB
 * triggers on profile change / new feedback) are computed and cached.
 */
export async function buildDishCards(tx: UserTx, dishes: DishRecord[]): Promise<DishCard[]> {
  const decoded = dishes.filter(isDecoded);
  if (decoded.length === 0) return [];
  const ids = decoded.map((d) => d.id);

  const cached = await tx.getMatches(ids);
  const stale = decoded.filter((d) => !cached.has(d.id));

  if (stale.length) {
    const staleIds = stale.map((d) => d.id);
    const [profile, stats, own] = await Promise.all([
      tx.getTasteProfile(),
      tx.feedbackStats(staleIds),
      tx.ownLiked(staleIds),
    ]);
    const fresh: CachedMatch[] = stale.map((d) => {
      const s = stats.get(d.id) ?? { entries: 0, likedUp: 0, likedDown: 0 };
      const r = computeMatch(
        profile,
        {
          spice: d.spice,
          ingredients: d.ingredients,
          dietaryTags: d.dietaryTags,
          feedbackCount: s.entries,
          likedCount: s.likedUp,
          dislikedCount: s.likedDown,
        },
        own.get(d.id) ?? null,
      );
      return { dishId: d.id, ...r };
    });
    await tx.upsertMatches(fresh);
    for (const m of fresh) cached.set(m.dishId, m);
  }

  return decoded.map((d) => toDishCard(d, cached.get(d.id)!));
}
