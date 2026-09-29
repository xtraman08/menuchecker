import type { Tx } from '../tx.js';
import type { RestaurantRow, RestaurantSummaryRow } from '../types.js';

const COLUMNS = `r.id, r.name, r.address, r.cuisine, r.created_by as "createdBy", r.created_at as "createdAt"`;

/** Creates a restaurant owned by the current diner. */
export async function create(
  tx: Tx,
  input: { name: string; address?: string | null; cuisine: string },
): Promise<RestaurantRow> {
  const { rows } = await tx.query<RestaurantRow>(
    `insert into restaurants as r (name, address, cuisine, created_by)
     values ($1, $2, $3, app_current_user_id())
     returning ${COLUMNS}`,
    [input.name, input.address ?? null, input.cuisine],
  );
  return rows[0]!;
}

export async function get(tx: Tx, id: string): Promise<RestaurantRow | null> {
  const { rows } = await tx.query<RestaurantRow>(
    `select ${COLUMNS} from restaurants r where r.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Escapes LIKE wildcards so user search text is matched literally. */
function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Shared library, newest first. `q` matches name or cuisine (case-insensitive).
 * dishCount counts the dishes on each restaurant's latest menu.
 */
export async function list(
  tx: Tx,
  opts: { q?: string; limit?: number } = {},
): Promise<RestaurantSummaryRow[]> {
  const q = opts.q?.trim();
  const { rows } = await tx.query<RestaurantSummaryRow>(
    `select r.id, r.name, r.address, r.cuisine, r.created_at as "createdAt",
            coalesce(dc.n, 0)::int as "dishCount"
       from restaurants r
       left join lateral (
         select count(d.id) as n
           from menus m
           join dishes d on d.menu_id = m.id
          where m.id = (select m2.id from menus m2 where m2.restaurant_id = r.id
                         order by m2.created_at desc, m2.id limit 1)
       ) dc on true
      where $1::text is null or r.name ilike $1 or r.cuisine ilike $1
      order by r.created_at desc, r.id
      limit $2`,
    [q ? likePattern(q) : null, Math.min(Math.max(opts.limit ?? 50, 1), 200)],
  );
  return rows;
}
