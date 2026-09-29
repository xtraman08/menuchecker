// Per-request user context. Every query the API makes on behalf of a diner runs
// inside withUserTx, which sets `app.user_id` for the transaction only; the RLS
// policies read it via app_current_user_id(). Outside a transaction nothing is
// visible (default deny).
import type pg from 'pg';
import { getPool } from './pool.js';

/** What repositories need: a client inside an open transaction. */
export interface Tx {
  query<R extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<pg.QueryResult<R>>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withUserTx<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
  pool: pg.Pool = getPool(),
): Promise<T> {
  if (!UUID_RE.test(userId)) throw new Error('withUserTx: userId must be a uuid');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
