#!/usr/bin/env node
// Runs an npm script in every workspace that defines it, with the repo-root .env
// loaded (without overriding variables already set in the environment).
//   node scripts/run-ws.mjs <script> [-- args]
import { loadEnv, run } from './lib.mjs';

const [script, ...rest] = process.argv.slice(2);
if (!script) {
  console.error('usage: run-ws.mjs <npm-script> [-- args]');
  process.exit(2);
}
loadEnv();
try {
  await run('npm', ['run', script, '--workspaces', '--if-present', ...rest]);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
