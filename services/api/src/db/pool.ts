// Postgres connection pool for the API. Connects as the runtime role `fare_app`
// (DATABASE_URL), which is subject to row-level security; never the owner role.
import pg from 'pg';

// Return bigint counts and numerics as JS numbers (all our counts are small).
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number.parseInt(v, 10));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number.parseFloat(v));

let pool: pg.Pool | undefined;

export function createPool(connectionString: string, options: pg.PoolConfig = {}): pg.Pool {
  return new pg.Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000, ...options });
}

/** The process-wide pool, created lazily from DATABASE_URL. */
export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    pool = createPool(url);
  }
  return pool;
}

/** Replace the process-wide pool (tests). */
export function setPool(next: pg.Pool | undefined): void {
  pool = next;
}

export async function closePool(): Promise<void> {
  const current = pool;
  pool = undefined;
  await current?.end();
}
