#!/usr/bin/env node
// Runs the API test suite including the DB/RLS integration tests, against the
// compose `db` container (started if needed). The suites create their own
// throwaway databases, so local data is untouched.
//   node scripts/test-db.mjs [vitest args]
import { compose, loadEnv, run } from './lib.mjs';

loadEnv();
const password = process.env.POSTGRES_PASSWORD || 'postgres';
const port = process.env.DB_PORT || 5432;
const adminUrl =
  process.env.TEST_DATABASE_ADMIN_URL ||
  `postgres://postgres:${encodeURIComponent(password)}@localhost:${port}/postgres`;

try {
  await compose(['up', '-d', '--wait', 'db']);
  await run('npm', ['test', '-w', '@fare/api', '--', ...process.argv.slice(2)], {
    env: { TEST_DATABASE_ADMIN_URL: adminUrl },
  });
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
