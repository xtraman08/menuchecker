#!/usr/bin/env node
// Hot-reload dev loop: Postgres in docker, API (tsx watch) and Expo web on the host.
//   node scripts/dev.mjs [--no-seed] [--no-web]
import { ENV_FILE, compose, isWindows, loadEnv, log, run, start } from './lib.mjs';
import { spawnSync } from 'node:child_process';
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

// On Windows the children run under cmd.exe (shell: true), so killing the direct
// child would orphan node/metro; kill the whole process tree instead.
const killTree = (c) => {
  if (c.exitCode !== null) return;
  if (isWindows) spawnSync('taskkill', ['/PID', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
  else c.kill();
};
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const c of children) killTree(c);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
process.on('SIGHUP', stop);
for (const c of children) {
  c.on('exit', (code) => {
    log(`a dev process exited with ${code}; stopping`);
    stop();
  });
}
