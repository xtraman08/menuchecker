// Anthropic client for the API service. Server-side only: the key and model
// come from the environment and are never exposed to the app.
import Anthropic from '@anthropic-ai/sdk';
import { LlmConfigError } from './errors.js';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

/** Per-request timeout. Covers adaptive thinking on a long menu; SDK retries timeouts too. */
export const REQUEST_TIMEOUT_MS = 180_000;
/** SDK retries 408/409/429/5xx and connection errors with backoff (honours retry-after). */
export const MAX_RETRIES = 3;

/**
 * Models that accept the server-side refusal fallback (`fallbacks: "default"`).
 * For any other configured model the parameter is left off.
 */
const FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);
export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * The subset of the SDK the module uses. Tests inject a fake with the same shape.
 * `create` is the SDK's `client.beta.messages.create`.
 */
export interface MessagesApi {
  create(
    params: Anthropic.Beta.MessageCreateParamsNonStreaming,
    options?: Anthropic.RequestOptions,
  ): Promise<Anthropic.Beta.BetaMessage>;
}

export interface LlmSettings {
  model: string;
  useFallbacks: boolean;
}

let injected: MessagesApi | null = null;
let cached: MessagesApi | null = null;

export function getSettings(env: NodeJS.ProcessEnv = process.env): LlmSettings {
  const model = env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
  return { model, useFallbacks: FALLBACK_MODELS.has(model) };
}

export function getMessagesApi(env: NodeJS.ProcessEnv = process.env): MessagesApi {
  if (injected) return injected;
  if (cached) return cached;
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new LlmConfigError('ANTHROPIC_API_KEY is not set; menu scanning and decoding are unavailable');
  }
  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES });
  cached = client.beta.messages;
  return cached;
}

/** Structured logger; Fastify's `app.log` (pino) fits this shape. */
export interface LlmLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

const consoleLogger: LlmLogger = {
  info: (obj, msg) => console.info(JSON.stringify({ msg, ...obj })),
  warn: (obj, msg) => console.warn(JSON.stringify({ msg, ...obj })),
};
let logger: LlmLogger = consoleLogger;

export function getLogger(): LlmLogger {
  return logger;
}

/** Route LLM call logs into the app logger. Pass null to restore the console default. */
export function setLlmLogger(next: LlmLogger | null): void {
  logger = next ?? consoleLogger;
}

/** Test hook: replace the SDK with a fake. Pass null to restore. */
export function setMessagesApiForTesting(api: MessagesApi | null): void {
  injected = api;
  cached = null;
}
