#!/usr/bin/env node
// Drops the local Postgres volume, recreates the database (roles via init SQL),
// then runs migrations and loads seed data. Destroys all local data.
//   node scripts/reset-db.mjs [--no-seed]
import { compose, log, run } from './lib.mjs';

const seed = !process.argv.includes('--no-seed');

await compose(['rm', '--stop', '--force', 'db']);
await run('docker', ['volume', 'rm', '--force', 'fare_db-data'], { allowFailure: true });
await compose(['up', '-d', '--wait', 'db']);
await compose(['run', '--rm', '--build', 'migrate']);
if (seed) await compose(['run', '--rm', 'seed']);
log('database reset complete');
