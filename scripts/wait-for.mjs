#!/usr/bin/env node
// Waits for one or more targets to become reachable.
//   node scripts/wait-for.mjs http://localhost:4000/health tcp://localhost:5432 [--timeout 120]
import { log, waitForTcp, waitForUrl } from './lib.mjs';

const args = process.argv.slice(2);
let timeoutMs = 120_000;
const targets = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--timeout') timeoutMs = Number(args[++i]) * 1000;
  else targets.push(args[i]);
}
if (targets.length === 0) {
  console.error('usage: wait-for.mjs <http(s)://url | tcp://host:port>... [--timeout seconds]');
  process.exit(2);
}

try {
  for (const target of targets) {
    const url = new URL(target);
    log(`waiting for ${target}`);
    if (url.protocol === 'tcp:') await waitForTcp(url.hostname, url.port, { timeoutMs });
    else await waitForUrl(target, { timeoutMs });
    log(`ready: ${target}`);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
