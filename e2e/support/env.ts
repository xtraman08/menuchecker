// Single place that reads configuration for the e2e suite.
// Values come from the process environment, falling back to the repo-root .env
// (loaded once, never overriding variables that are already set).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const E2E_ROOT = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(E2E_ROOT, '..');
export const FIXTURES_DIR = path.join(E2E_ROOT, 'fixtures');

const rootEnv = path.join(REPO_ROOT, '.env');
if (existsSync(rootEnv)) {
  try {
    process.loadEnvFile(rootEnv);
  } catch {
    // An empty or unreadable .env just means we rely on the process environment.
  }
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const env = {
  webUrl: process.env.WEB_URL ?? `http://localhost:${process.env.WEB_PORT ?? '8080'}`,
  apiUrl: process.env.API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://fare_app:fare_app@localhost:5432/fare',
  anthropicKey: (process.env.ANTHROPIC_API_KEY ?? '').trim(),
  maxUploadBytes: num('MAX_UPLOAD_BYTES', 8_000_000),
  rateLimitScanPerHour: num('RATE_LIMIT_SCAN_PER_HOUR', 20),
};

export const hasAnthropicKey = env.anthropicKey.length > 0;
export const NO_KEY_REASON =
  'ANTHROPIC_API_KEY is empty: skipping specs that call the real Claude API (scan/decode). ' +
  'Set it in the repo-root .env or the environment to run them.';
