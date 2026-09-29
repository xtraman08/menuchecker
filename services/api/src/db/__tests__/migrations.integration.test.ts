import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { listMigrations, migrate, MIGRATIONS_DIR } from '../../../../../db/scripts/migrate.mjs';
import { seed } from '../../../../../db/scripts/seed.mjs';
import { ADMIN_URL, createEmptyDb } from './testDb.js';

const quiet = { log: () => {} };

async function ownerQuery<R extends pg.QueryResultRow>(url: string, sql: string): Promise<R[]> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return (await c.query<R>(sql)).rows;
  } finally {
    await c.end();
  }
}

describe.skipIf(!ADMIN_URL)('migrations (real Postgres)', () => {
  let db: Awaited<ReturnType<typeof createEmptyDb>>;

  beforeAll(async () => {
    db = await createEmptyDb();
  });
  afterAll(async () => {
    await db?.drop();
  });

  it('applies every migration from zero, then is a no-op on re-run', async () => {
    const all = (await listMigrations()).map((m) => m.name);
    expect(await migrate({ connectionString: db.ownerUrl, ...quiet })).toEqual(all);
    expect(await migrate({ connectionString: db.ownerUrl, ...quiet })).toEqual([]);

    const rows = await ownerQuery<{ name: string }>(
      db.ownerUrl,
      'select name from schema_migrations order by name',
    );
    expect(rows.map((r) => r.name)).toEqual(all);
  });

  it('enables row-level security on every application table', async () => {
    const rows = await ownerQuery<{ relname: string; relrowsecurity: boolean }>(
      db.ownerUrl,
      `select c.relname, c.relrowsecurity from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'schema_migrations'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(7);
    for (const r of rows) expect(r, r.relname).toMatchObject({ relrowsecurity: true });
  });

  it('refuses to run when an applied migration was edited', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fare-mig-'));
    try {
      await cp(MIGRATIONS_DIR, dir, { recursive: true });
      const first = (await listMigrations(dir))[0]!.name;
      const file = path.join(dir, first);
      await writeFile(file, `${await readFile(file, 'utf8')}\n-- edited\n`);
      await expect(migrate({ connectionString: db.ownerUrl, dir, ...quiet })).rejects.toThrow(
        /modified/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rolls back a failing migration and records nothing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'fare-mig-'));
    try {
      await cp(MIGRATIONS_DIR, dir, { recursive: true });
      await writeFile(
        path.join(dir, '9999_broken.sql'),
        'create table half_done (id int);\nselect 1/0;\n',
      );
      await expect(migrate({ connectionString: db.ownerUrl, dir, ...quiet })).rejects.toThrow(
        /9999_broken/,
      );
      const rows = await ownerQuery(
        db.ownerUrl,
        `select 1 from schema_migrations where name = '9999_broken.sql'
         union all select 1 from pg_tables where tablename = 'half_done'`,
      );
      expect(rows).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('seed loads, is idempotent, and trigger-maintained counters match', async () => {
    await seed({ connectionString: db.ownerUrl, ...quiet });
    await seed({ connectionString: db.ownerUrl, ...quiet });
    const counts = await ownerQuery<{ restaurants: number; dishes: number; feedback: number }>(
      db.ownerUrl,
      `select (select count(*) from restaurants)::int as restaurants,
              (select count(*) from dishes)::int as dishes,
              (select count(*) from dish_feedback)::int as feedback`,
    );
    expect(counts[0]).toEqual({ restaurants: 2, dishes: 14, feedback: 13 });

    const doro = await ownerQuery<{ feedback_up: number; feedback_down: number }>(
      db.ownerUrl,
      `select feedback_up, feedback_down from dishes where native_name = 'Doro Wat'`,
    );
    expect(doro[0]).toEqual({ feedback_up: 9, feedback_down: 1 });

    const undecoded = await ownerQuery(
      db.ownerUrl,
      `select 1 from dishes where anchor is null or description is null or spice is null
          or texture is null or adventurousness is null or decoded_at is null`,
    );
    expect(undecoded).toHaveLength(0);
  });
});
