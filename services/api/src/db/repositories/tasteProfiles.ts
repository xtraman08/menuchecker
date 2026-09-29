import type { TasteProfile } from '@fare/shared';
import type { Tx } from '../tx.js';
import type { TasteProfileRow } from '../types.js';

const COLUMNS = `id, user_id as "userId", dietary_restrictions as "dietaryRestrictions",
  spice_tolerance as "spiceTolerance", avoided_ingredients as "avoidedIngredients",
  favorite_ingredients as "favoriteIngredients", cuisines_tried as "cuisinesTried", updated_at as "updatedAt"`;

/** The current diner's taste profile, or null if they have not made one yet. */
export async function get(tx: Tx): Promise<TasteProfileRow | null> {
  const { rows } = await tx.query<TasteProfileRow>(
    `select ${COLUMNS} from taste_profiles where user_id = app_current_user_id()`,
  );
  return rows[0] ?? null;
}

/**
 * Creates or replaces the current diner's taste profile. A database trigger
 * clears their cached matches so they are recomputed.
 */
export async function upsert(tx: Tx, profile: TasteProfile): Promise<TasteProfileRow> {
  const { rows } = await tx.query<TasteProfileRow>(
    `insert into taste_profiles
       (user_id, dietary_restrictions, spice_tolerance, avoided_ingredients, favorite_ingredients, cuisines_tried)
     values (app_current_user_id(), $1, $2, $3, $4, $5)
     on conflict (user_id) do update
        set dietary_restrictions = excluded.dietary_restrictions,
            spice_tolerance      = excluded.spice_tolerance,
            avoided_ingredients  = excluded.avoided_ingredients,
            favorite_ingredients = excluded.favorite_ingredients,
            cuisines_tried       = excluded.cuisines_tried
     returning ${COLUMNS}`,
    [
      profile.dietaryRestrictions,
      profile.spiceTolerance,
      profile.avoidedIngredients,
      profile.favoriteIngredients,
      profile.cuisinesTried,
    ],
  );
  return rows[0]!;
}
