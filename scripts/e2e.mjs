#!/usr/bin/env node
// End-to-end run against a fresh docker compose stack:
//   build → up db (+ one-shot migrate) → seed → api + web → wait → playwright → down -v
//
//   node scripts/e2e.mjs [--keep] [--no-build] [-- <playwright args>]
//     --keep      leave the stack running afterwards (for debugging)
//     --no-build  reuse existing images
//     --skip-browser-install  don't run `playwright install chromium` first
// Uses its own compose project (fare-e2e) so the database always starts empty;
// stop the dev stack first if it holds the same ports.
import { ENV_FILE, ROOT, compose, loadEnv, log, run, waitForUrl } from './lib.mjs';
import { existsSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const own = sep === -1 ? argv : argv.slice(0, sep);
const playwrightArgs = sep === -1 ? [] : argv.slice(sep + 1);
const keep = own.includes('--keep');
const build = !own.includes('--no-build');
const installBrowsers = !own.includes('--skip-browser-install');

if (!existsSync(ENV_FILE)) {
  console.error('.env not found. Run `npm run setup` first.');
  process.exit(1);
}
loadEnv();

const project = ['-p', 'fare-e2e'];
const apiUrl = `http://localhost:${process.env.API_PORT || 4000}`;
const webUrl = `http://localhost:${process.env.WEB_PORT || 8080}`;

let exitCode = 1;
try {
  if (installBrowsers) {
    await run('npx', ['playwright', 'install', 'chromium'], { cwd: path.join(ROOT, 'e2e') });
  }
  if (build) await compose([...project, 'build']);
  await compose([...project, 'up', '-d', '--wait', 'db']);
  await compose([...project, 'run', '--rm', 'migrate']);
  await compose([...project, 'run', '--rm', 'seed']);
  await compose([...project, 'up', '-d', '--wait', 'api', 'web']);
  await waitForUrl(`${apiUrl}/health`);
  await waitForUrl(webUrl);
  log(`stack ready: api ${apiUrl}, web ${webUrl}`);

  if (!process.env.ANTHROPIC_API_KEY) {
    log('ANTHROPIC_API_KEY is empty: scan/decode specs will be skipped.');
  }
  exitCode = await run('npx', ['playwright', 'test', ...playwrightArgs], {
    cwd: path.join(ROOT, 'e2e'),
    env: { API_URL: apiUrl, WEB_URL: webUrl },
    allowFailure: true,
  });
} catch (err) {
  console.error(`e2e setup failed: ${err.message}`);
  await compose([...project, 'logs', '--no-color', '--tail', '200'], { allowFailure: true });
  exitCode = 1;
} finally {
  if (keep) {
    log('--keep: stack left running (docker compose -p fare-e2e down -v to remove)');
  } else {
    if (exitCode !== 0) {
      await compose([...project, 'logs', '--no-color', '--tail', '100', 'api'], {
        allowFailure: true,
      });
    }
    await compose([...project, 'down', '-v', '--remove-orphans'], { allowFailure: true });
  }
}
process.exit(exitCode);
