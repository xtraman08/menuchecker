#!/usr/bin/env node
// One-time (and re-runnable) local setup:
//   1. checks Node and Docker,
//   2. creates .env from .env.example, or appends keys missing from an existing .env
//      (never overwrites values you set; replaces an unset/placeholder JWT_SECRET),
//   3. npm install,
//   4. installs Playwright Chromium (skip with --skip-browsers).
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ENV_FILE, ROOT, log, run } from './lib.mjs';

const skipBrowsers = process.argv.includes('--skip-browsers');

const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  console.error(`Node >= 20 is required (found ${process.versions.node}).`);
  process.exit(1);
}

if ((await run('docker', ['compose', 'version'], { allowFailure: true, quiet: true })) !== 0) {
  log('warning: `docker compose` not found; install Docker Desktop to run the stack.');
}

function parseEnv(text) {
  const out = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (m) out.set(m[1], m[2].trim());
  }
  return out;
}

const example = readFileSync(path.join(ROOT, '.env.example'), 'utf8');
const exampleVars = parseEnv(example);
const secret = () => randomBytes(32).toString('hex');

if (!existsSync(ENV_FILE) || readFileSync(ENV_FILE, 'utf8').trim() === '') {
  writeFileSync(ENV_FILE, example.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret()}`));
  log('created .env from .env.example (set ANTHROPIC_API_KEY to enable scan/decode)');
} else {
  let current = readFileSync(ENV_FILE, 'utf8');
  const have = parseEnv(current);
  const added = [];
  for (const [key, value] of exampleVars) {
    if (have.has(key)) continue;
    const v = key === 'JWT_SECRET' ? secret() : value;
    current += `${current.endsWith('\n') ? '' : '\n'}${key}=${v}\n`;
    added.push(key);
  }
  if (['', 'change-me'].includes(have.get('JWT_SECRET') ?? 'x')) {
    current = current.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret()}`);
    added.push('JWT_SECRET (generated)');
  }
  if (added.length) {
    writeFileSync(ENV_FILE, current);
    log(`added to .env: ${added.join(', ')}`);
  } else {
    log('.env already complete');
  }
}

if (!parseEnv(readFileSync(ENV_FILE, 'utf8')).get('ANTHROPIC_API_KEY')) {
  log('note: ANTHROPIC_API_KEY is empty in .env; scan/decode and their e2e specs will be skipped.');
}

await run('npm', ['install']);
if (!skipBrowsers) {
  await run('npx', ['playwright', 'install', 'chromium'], { cwd: path.join(ROOT, 'e2e') });
}
log('setup complete. Next: `npm run docker:up` (full stack) or `npm run dev` (hot reload).');
