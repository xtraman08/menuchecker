import type { Tx } from '../tx.js';
import type { FeedbackRow, FeedbackStats } from '../types.js';

const COLUMNS = `f.id, f.dish_id as "dishId", f.user_id as "userId", f.accurate,
  f.tastes_like as "tastesLike", f.liked, f.created_at as "createdAt", f.updated_at as "updatedAt"`;

/**
 * Records the current diner's feedback on a dish. One row per (diner, dish):
 * fields left undefined keep their previous value. A database trigger updates
 * dishes.feedback_up/down and clears every diner's cached match for the dish.
 */
export async function upsert(
  tx: Tx,
  input: { dishId: string; accurate?: boolean; tastesLike?: string; liked?: boolean },
): Promise<FeedbackRow> {
  const { rows } = await tx.query<FeedbackRow>(
    `insert into dish_feedback as f (dish_id, user_id, accurate, tastes_like, liked)
     values ($1, app_current_user_id(), $2, $3, $4)
     on conflict (dish_id, user_id) do update
        set accurate    = coalesce(excluded.accurate, f.accurate),
            tastes_like = coalesce(excluded.tastes_like, f.tastes_like),
            liked       = coalesce(excluded.liked, f.liked)
     returning ${COLUMNS}`,
    [input.dishId, input.accurate ?? null, input.tastesLike ?? null, input.liked ?? null],
  );
  return rows[0]!;
}

/** The current diner's feedback on the given dishes. */
export async function listMine(tx: Tx, dishIds: string[]): Promise<FeedbackRow[]> {
  if (dishIds.length === 0) return [];
  const { rows } = await tx.query<FeedbackRow>(
    `select ${COLUMNS} from dish_feedback f where f.dish_id = any($1::uuid[])`,
    [dishIds],
  );
  return rows;
}

const EMPTY_STATS: FeedbackStats = {
  entries: 0,
  accurateUp: 0,
  accurateDown: 0,
  likedUp: 0,
  likedDown: 0,
  likedRate: null,
};

/**
 * Aggregate feedback across ALL diners (counts only). Every requested dish is in
 * the map; dishes without feedback get zero counts.
 */
export async function stats(tx: Tx, dishIds: string[]): Promise<Map<string, FeedbackStats>> {
  const out = new Map<string, FeedbackStats>(dishIds.map((id) => [id, { ...EMPTY_STATS }]));
  if (dishIds.length === 0) return out;
  const { rows } = await tx.query<FeedbackStats & { dishId: string }>(
    `select dish_id as "dishId", entries, accurate_up as "accurateUp", accurate_down as "accurateDown",
            liked_up as "likedUp", liked_down as "likedDown", liked_rate as "likedRate"
       from dish_feedback_stats($1::uuid[])`,
    [dishIds],
  );
  for (const { dishId, ...s } of rows) out.set(dishId, s);
  return out;
}
