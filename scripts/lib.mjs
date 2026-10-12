// Shared helpers for the cross-platform repo scripts (Windows, macOS, Linux).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = path.join(ROOT, '.env');
export const isWindows = process.platform === 'win32';

export function log(msg) {
  console.log(`\x1b[36m[fare]\x1b[0m ${msg}`);
}

/** Loads the repo-root .env into process.env without overriding variables already set. */
export function loadEnv() {
  if (!existsSync(ENV_FILE)) return;
  try {
    process.loadEnvFile(ENV_FILE);
  } catch (err) {
    log(`warning: could not read .env (${err.message})`);
  }
}

/**
 * Runs a command, inheriting stdio. Resolves with the exit code, or rejects on a
 * non-zero code unless `allowFailure` is set. npm/npx need a shell on Windows.
 */
export function run(cmd, args = [], { allowFailure = false, env, cwd = ROOT, quiet = false } = {}) {
  if (!quiet) log(`$ ${cmd} ${args.join(' ')}`);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      env: { ...process.env, ...env },
      shell: isWindows && (cmd === 'npm' || cmd === 'npx'),
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      const status = code ?? (signal ? 1 : 0);
      if (status !== 0 && !allowFailure) {
        reject(new Error(`${cmd} ${args.join(' ')} exited with ${status}`));
      } else {
        resolve(status);
      }
    });
  });
}

/** Starts a long-running command with prefixed output; returns the child process. */
export function start(name, cmd, args, { env, cwd = ROOT } = {}) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    shell: isWindows,
  });
  const prefix = `\x1b[35m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  return child;
}

export function compose(args, opts) {
  return run('docker', ['compose', ...args], opts);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls an http(s) URL until it answers 2xx/3xx, or throws after timeoutMs. */
export async function waitForUrl(url, { timeoutMs = 120_000, intervalMs = 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'no response';
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok || (res.status >= 300 && res.status < 400)) return;
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.cause?.code ?? err.message;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${url} (${lastError})`);
}

/** Waits until a TCP port accepts connections. */
export async function waitForTcp(host, port, { timeoutMs = 120_000, intervalMs = 1000 } = {}) {
  const net = await import('node:net');
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const socket = net.connect({ host, port: Number(port) });
      socket.setTimeout(3000);
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => resolve(false));
    });
    if (ok) return;
    await sleep(intervalMs);
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for tcp://${host}:${port}`);
}
