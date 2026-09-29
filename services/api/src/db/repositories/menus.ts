import type { MenuSource } from '@fare/shared';
import type { Tx } from '../tx.js';
import type { MenuRow } from '../types.js';

const COLUMNS = `id, restaurant_id as "restaurantId", source, created_by as "createdBy", created_at as "createdAt"`;

/** Adds a menu to a restaurant the current diner created. */
export async function create(
  tx: Tx,
  input: { restaurantId: string; source: MenuSource },
): Promise<MenuRow> {
  const { rows } = await tx.query<MenuRow>(
    `insert into menus (restaurant_id, source, created_by)
     values ($1, $2, app_current_user_id())
     returning ${COLUMNS}`,
    [input.restaurantId, input.source],
  );
  return rows[0]!;
}

/** The restaurant's current (most recent) menu. */
export async function latestForRestaurant(tx: Tx, restaurantId: string): Promise<MenuRow | null> {
  const { rows } = await tx.query<MenuRow>(
    `select ${COLUMNS} from menus where restaurant_id = $1
      order by created_at desc, id limit 1`,
    [restaurantId],
  );
  return rows[0] ?? null;
}
