import type { DecodedDish } from '@fare/shared';
import type { Tx } from '../tx.js';
import type { DishRow, DishWithMatchRow, NewDish } from '../types.js';

const COLUMNS = `d.id, d.menu_id as "menuId", d.position, d.native_name as "nativeName", d.price,
  d.raw_text as "rawText", d.anchor, d.description, d.spice, d.texture, d.adventurousness, d.note,
  d.photo_url as "photoUrl", d.ingredients, d.dietary_tags as "dietaryTags", d.source, d.confidence,
  d.feedback_up as "feedbackUp", d.feedback_down as "feedbackDown", d.decoded_at as "decodedAt",
  d.created_at as "createdAt", d.updated_at as "updatedAt"`;

// The current diner's cached match; RLS already limits dish_matches to their rows.
const WITH_MATCH = `${COLUMNS}, m.restaurant_id as "restaurantId",
  dm.match_score as "matchScore", coalesce(dm.match_state, 'unrated') as "matchState",
  dm.explanation as "matchExplanation", dm.explanation_kind as "matchExplanationKind", (dm.id is not null) as "matchCached"`;

const WITH_MATCH_FROM = `dishes d
  join menus m on m.id = d.menu_id
  left join dish_matches dm on dm.dish_id = d.id and dm.user_id = app_current_user_id()`;

/**
 * Inserts dishes onto a menu the current diner created; position follows array
 * order. A dish counts as decoded (decodedAt set) when it arrives with an anchor.
 * Array columns go through JSON because unnest() cannot return ragged 2-D arrays.
 */
export async function createMany(tx: Tx, menuId: string, dishes: NewDish[]): Promise<DishRow[]> {
  if (dishes.length === 0) return [];
  const { rows } = await tx.query<DishRow>(
    `insert into dishes as d (menu_id, position, native_name, price, raw_text, confidence, photo_url,
                              anchor, description, spice, texture, adventurousness, note,
                              ingredients, dietary_tags, decoded_at)
     select $1, t.ord - 1, t.native_name, t.price, t.raw_text, t.confidence::confidence, t.photo_url,
            t.anchor, t.description, t.spice, t.texture, t.adventurousness, t.note,
            array(select jsonb_array_elements_text(t.ingredients)),
            array(select jsonb_array_elements_text(t.dietary_tags)),
            case when t.anchor is not null then now() end
       from unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
                   $9::smallint[], $10::text[], $11::smallint[], $12::text[], $13::jsonb[], $14::jsonb[])
            with ordinality as t(native_name, price, raw_text, confidence, photo_url, anchor, description,
                                 spice, texture, adventurousness, note, ingredients, dietary_tags, ord)
     order by t.ord
     returning ${COLUMNS}`,
    [
      menuId,
      dishes.map((d) => d.nativeName),
      dishes.map((d) => d.price),
      dishes.map((d) => d.rawText ?? null),
      dishes.map((d) => d.confidence ?? 'low'),
      dishes.map((d) => d.photoUrl ?? null),
      dishes.map((d) => d.anchor ?? null),
      dishes.map((d) => d.description ?? null),
      dishes.map((d) => d.spice ?? null),
      dishes.map((d) => d.texture ?? null),
      dishes.map((d) => d.adventurousness ?? null),
      dishes.map((d) => d.note ?? null),
      dishes.map((d) => JSON.stringify(d.ingredients ?? [])),
      dishes.map((d) => JSON.stringify(d.dietaryTags ?? [])),
    ],
  );
  return rows.sort((a, b) => a.position - b.position);
}

/** Saves the AI decode pass for a dish (creator only). Source stays ai_generated. */
export async function applyDecode(
  tx: Tx,
  dishId: string,
  decoded: DecodedDish,
): Promise<DishRow | null> {
  const { rows } = await tx.query<DishRow>(
    `update dishes d
        set anchor = $2, description = $3, spice = $4, texture = $5, adventurousness = $6,
            note = $7, ingredients = $8, dietary_tags = $9, confidence = $10, decoded_at = now()
      where d.id = $1
      returning ${COLUMNS}`,
    [
      dishId,
      decoded.anchor,
      decoded.description,
      decoded.spice,
      decoded.texture,
      decoded.adventurousness,
      decoded.note,
      decoded.ingredients,
      decoded.dietaryTags,
      decoded.confidence,
    ],
  );
  return rows[0] ?? null;
}

export async function get(tx: Tx, id: string): Promise<DishRow | null> {
  const { rows } = await tx.query<DishRow>(`select ${COLUMNS} from dishes d where d.id = $1`, [id]);
  return rows[0] ?? null;
}

/** One dish with the current diner's cached match. */
export async function getWithMatch(tx: Tx, id: string): Promise<DishWithMatchRow | null> {
  const { rows } = await tx.query<DishWithMatchRow>(
    `select ${WITH_MATCH} from ${WITH_MATCH_FROM} where d.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Dishes on the restaurant's latest menu, in menu order, with the diner's cached matches. */
export async function listByRestaurant(tx: Tx, restaurantId: string): Promise<DishWithMatchRow[]> {
  const { rows } = await tx.query<DishWithMatchRow>(
    `select ${WITH_MATCH} from ${WITH_MATCH_FROM}
      where m.id = (select m2.id from menus m2 where m2.restaurant_id = $1
                     order by m2.created_at desc, m2.id limit 1)
      order by d.position, d.id`,
    [restaurantId],
  );
  return rows;
}
