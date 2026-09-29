#!/usr/bin/env node
// Hot-reload dev loop: Postgres in docker, API (tsx watch) and Expo web on the host.
//   node scripts/dev.mjs [--no-seed] [--no-web]
import { ENV_FILE, compose, loadEnv, log, run, start } from './lib.mjs';
import { existsSync } from 'node:fs';

if (!existsSync(ENV_FILE)) {
  console.error('.env not found. Run `npm run setup` first.');
  process.exit(1);
}
loadEnv();

await compose(['up', '-d', '--wait', 'db']);
await run('npm', ['run', 'migrate', '-w', '@fare/db']);
if (!process.argv.includes('--no-seed')) await run('npm', ['run', 'seed', '-w', '@fare/db']);

const children = [start('api', 'npm', ['run', 'dev', '-w', '@fare/api'])];
if (!process.argv.includes('--no-web')) {
  children.push(start('web', 'npm', ['run', 'web', '-w', '@fare/mobile']));
}
log(
  'dev running: api http://localhost:' +
    (process.env.API_PORT || 4000) +
    ' (Ctrl+C to stop; db keeps running)',
);

const stop = () => {
  for (const c of children) c.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const c of children) {
  c.on('exit', (code) => {
    log(`a dev process exited with ${code}; stopping`);
    stop();
  });
}
