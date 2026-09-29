// Tiny migration runner: applies db/migrations/NNNN_name.sql in order, each in its
// own transaction, recording name + checksum in schema_migrations. Re-running is a
// no-op; editing an already-applied file is an error (add a new migration instead).
//
// Usage: node db/scripts/migrate.mjs   (connects with DATABASE_MIGRATE_URL)
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, '..', 'migrations');

// Arbitrary constant so concurrent runners (e.g. two compose services) serialise.
const LOCK_KEY = 4_815_162_342;

export async function listMigrations(dir = MIGRATIONS_DIR) {
  const files = (await readdir(dir)).filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f)).sort();
  return Promise.all(
    files.map(async (name) => {
      const sql = await readFile(path.join(dir, name), 'utf8');
      const checksum = createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');
      return { name, sql, checksum };
    }),
  );
}

/** Applies pending migrations. Returns the names applied in this run. */
export async function migrate({ connectionString, dir = MIGRATIONS_DIR, log = console.log } = {}) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  const applied = [];
  try {
    await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
    await client.query(`
      create table if not exists schema_migrations (
        name       text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      )`);
    const { rows } = await client.query('select name, checksum from schema_migrations');
    const done = new Map(rows.map((r) => [r.name, r.checksum]));

    for (const m of await listMigrations(dir)) {
      if (done.has(m.name)) {
        if (done.get(m.name) !== m.checksum) {
          throw new Error(
            `Migration ${m.name} was modified after being applied; add a new migration instead.`,
          );
        }
        continue;
      }
      try {
        await client.query('begin');
        await client.query(m.sql);
        await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [
          m.name,
          m.checksum,
        ]);
        await client.query('commit');
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Migration ${m.name} failed: ${err.message}`, { cause: err });
      }
      applied.push(m.name);
      log(`applied ${m.name}`);
    }
    if (applied.length === 0) log('database is up to date');
  } finally {
    await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
    await client.end();
  }
  return applied;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const connectionString = process.env.DATABASE_MIGRATE_URL;
  if (!connectionString) {
    console.error('DATABASE_MIGRATE_URL is not set');
    process.exit(1);
  }
  migrate({ connectionString }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
