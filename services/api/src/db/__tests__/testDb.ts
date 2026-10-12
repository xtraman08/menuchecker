// Creates a throwaway database for integration tests on a real Postgres.
// Needs TEST_DATABASE_ADMIN_URL: a superuser URL, e.g.
//   postgres://postgres:postgres@localhost:5432/postgres
// Roles fare_owner / fare_app are created if missing (as in the compose init
// script); the database is owned by fare_owner and migrated from zero.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../../../../../db/scripts/migrate.mjs';
import { createPool } from '../pool.js';

export const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;

export interface TestDb {
  name: string;
  ownerUrl: string;
  appUrl: string;
  /** Pool connected as fare_app (RLS applies). */
  app: pg.Pool;
  drop(): Promise<void>;
}

function withCredentials(base: string, user: string, password: string, database: string): string {
  const url = new URL(base);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}

async function admin<T>(fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: ADMIN_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

// Test files run in parallel, so tolerate another worker creating the role first.
export async function ensureRoles(): Promise<void> {
  await admin(async (c) => {
    for (const ddl of [
      `create role fare_owner login password 'fare_owner'`,
      `create role fare_app login password 'fare_app' nosuperuser nocreatedb nocreaterole nobypassrls`,
    ]) {
      await c.query(`
        do $$ begin
          ${ddl};
        exception when duplicate_object or unique_violation then null;
        end $$`);
    }
  });
}

/** Creates an empty database owned by fare_owner. Does not migrate. */
export async function createEmptyDb(): Promise<Omit<TestDb, 'app'>> {
  if (!ADMIN_URL) throw new Error('TEST_DATABASE_ADMIN_URL is not set');
  await ensureRoles();
  const name = `fare_test_${randomBytes(6).toString('hex')}`;
  await admin((c) => c.query(`create database ${name} owner fare_owner`));
  return {
    name,
    ownerUrl: withCredentials(ADMIN_URL, 'fare_owner', 'fare_owner', name),
    appUrl: withCredentials(ADMIN_URL, 'fare_app', 'fare_app', name),
    drop: () =>
      admin((c) => c.query(`drop database if exists ${name} with (force)`)).then(() => {}),
  };
}

/** A migrated database plus a fare_app pool. */
export async function createTestDb(): Promise<TestDb> {
  const db = await createEmptyDb();
  await migrate({ connectionString: db.ownerUrl, log: () => {} });
  const app = createPool(db.appUrl, { max: 4 });
  return {
    ...db,
    app,
    drop: async () => {
      await app.end();
      await db.drop();
    },
  };
}
