import type { Tx } from '../tx.js';
import type { MatchInput, MatchRow } from '../types.js';

const COLUMNS = `dish_id as "dishId", user_id as "userId", match_score as "matchScore",
  match_state as "matchState", explanation, computed_at as "computedAt"`;

/** The current diner's cached matches for the given dishes. */
export async function listMine(tx: Tx, dishIds: string[]): Promise<MatchRow[]> {
  if (dishIds.length === 0) return [];
  const { rows } = await tx.query<MatchRow>(
    `select ${COLUMNS} from dish_matches where dish_id = any($1::uuid[])`,
    [dishIds],
  );
  return rows;
}

/**
 * Caches computed matches for the current diner. `unrated` must carry a null
 * score and rated states a score (enforced by a check constraint).
 */
export async function upsertMany(tx: Tx, matches: MatchInput[]): Promise<MatchRow[]> {
  if (matches.length === 0) return [];
  const { rows } = await tx.query<MatchRow>(
    `insert into dish_matches (dish_id, user_id, match_score, match_state, explanation)
     select t.dish_id, app_current_user_id(), t.match_score, t.match_state::match_state, t.explanation
       from unnest($1::uuid[], $2::smallint[], $3::text[], $4::text[])
            as t(dish_id, match_score, match_state, explanation)
     on conflict (dish_id, user_id) do update
        set match_score = excluded.match_score,
            match_state = excluded.match_state,
            explanation = excluded.explanation,
            computed_at = now()
     returning ${COLUMNS}`,
    [
      matches.map((m) => m.dishId),
      matches.map((m) => m.matchScore),
      matches.map((m) => m.matchState),
      matches.map((m) => m.explanation),
    ],
  );
  return rows;
}
