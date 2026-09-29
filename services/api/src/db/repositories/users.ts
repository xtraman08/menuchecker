import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { getPool } from '../pool.js';
import { withUserTx, type Tx } from '../tx.js';
import type { UserRow } from '../types.js';

const COLUMNS = 'id, created_at as "createdAt"';

/** Creates an anonymous diner. Runs its own transaction as that new user. */
export async function createAnonymous(pool: pg.Pool = getPool()): Promise<UserRow> {
  const id = randomUUID();
  return withUserTx(
    id,
    async (tx) => {
      const { rows } = await tx.query<UserRow>(
        `insert into users (id) values ($1) returning ${COLUMNS}`,
        [id],
      );
      return rows[0]!;
    },
    pool,
  );
}

/** The current diner's own row (other users are invisible under RLS). */
export async function get(tx: Tx, id: string): Promise<UserRow | null> {
  const { rows } = await tx.query<UserRow>(`select ${COLUMNS} from users where id = $1`, [id]);
  return rows[0] ?? null;
}
