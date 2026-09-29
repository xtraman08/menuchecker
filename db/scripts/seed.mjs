// Loads db/seed/seed.sql (idempotent). Usage: node db/scripts/seed.mjs
// Connects with DATABASE_MIGRATE_URL (table owner), after migrations have run.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SEED_FILE = path.resolve(here, '..', 'seed', 'seed.sql');

export async function seed({ connectionString, file = SEED_FILE, log = console.log } = {}) {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(await readFile(file, 'utf8'));
    log(`seeded from ${path.basename(file)}`);
  } finally {
    await client.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const connectionString = process.env.DATABASE_MIGRATE_URL;
  if (!connectionString) {
    console.error('DATABASE_MIGRATE_URL is not set');
    process.exit(1);
  }
  seed({ connectionString }).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
