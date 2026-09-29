// One structured-output call with validation and a single retry.
// Flow: request (JSON Schema via output_config.format) -> check stop_reason ->
// JSON.parse -> zod validate (+ optional extra check) -> on failure, retry once
// with a note listing the problems -> on second failure, throw LlmOutputError.
import Anthropic from '@anthropic-ai/sdk';
import type { z } from 'zod';
import { FALLBACK_BETA, getLogger, getMessagesApi, getSettings } from './client.js';
import { LlmOutputError, LlmUpstreamError } from './errors.js';
import { retryNote } from './prompts.js';

export interface StructuredCall<S extends z.ZodTypeAny> {
  /** Short label for logs and error messages, e.g. "parse" or "decode". */
  label: string;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  jsonSchema: Record<string, unknown>;
  schema: S;
  /** Extra semantic checks after zod passes; return a list of problems (empty = ok). */
  check?: (value: z.output<S>) => string[];
  maxTokens?: number;
  signal?: AbortSignal;
}

const DEFAULT_MAX_TOKENS = 16_000;
/** Routine extraction; medium keeps latency and cost down without hurting quality here. */
const EFFORT = 'medium';

export async function callStructured<S extends z.ZodTypeAny>(
  call: StructuredCall<S>,
): Promise<z.output<S>> {
  const api = getMessagesApi();
  const settings = getSettings();
  let issues: string[] = [];

  for (let attempt = 1; attempt <= 2; attempt++) {
    const content =
      attempt === 1
        ? call.content
        : [...call.content, { type: 'text' as const, text: retryNote(issues) }];

    const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
      model: settings.model,
      max_tokens: call.maxTokens ?? DEFAULT_MAX_TOKENS,
      system: [{ type: 'text', text: call.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content }],
      output_config: {
        effort: EFFORT,
        format: { type: 'json_schema', schema: call.jsonSchema },
      },
    };
    if (settings.useFallbacks) {
      params.betas = [FALLBACK_BETA];
      // Refusal fallback: a (false-positive) safety decline is re-run on
      // Anthropic's recommended fallback model instead of failing the scan.
      (params as unknown as Record<string, unknown>).fallbacks = 'default';
    }

    const started = Date.now();
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await api.create(params, { signal: call.signal });
    } catch (err) {
      logUpstreamFailure(call.label, attempt, settings.model, err, Date.now() - started);
      throw toUpstreamError(call.label, err);
    }

    const result = validate(message, call);
    logCall(call.label, attempt, settings.model, message, result, Date.now() - started);
    if (result.ok) return result.value;
    issues = result.issues;
    if (result.fatal) break;
  }

  throw new LlmOutputError(`${call.label}: model output failed validation`, issues);
}

/**
 * One log line per API call: which model actually answered (differs from the
 * requested one after a refusal fallback), outcome and token usage. Never logs
 * prompt or model text.
 */
function logCall(
  label: string,
  attempt: number,
  requestedModel: string,
  message: Anthropic.Beta.BetaMessage,
  result: Validation<unknown>,
  durationMs: number,
): void {
  const usage = message.usage as Anthropic.Beta.BetaUsage & {
    iterations?: { type: string }[] | null;
  };
  const fellBack =
    message.model !== requestedModel ||
    message.content.some((b) => (b.type as string) === 'fallback') ||
    (usage.iterations ?? []).some((i) => i.type === 'fallback_message');
  const entry = {
    llm: label,
    attempt,
    requestedModel,
    servedModel: message.model,
    fellBack,
    stopReason: message.stop_reason,
    valid: result.ok,
    ...(result.ok ? {} : { issues: result.issues.slice(0, 5) }),
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    durationMs,
  };
  const log = getLogger();
  if (result.ok && !fellBack) log.info(entry, 'llm call');
  else
    log.warn(
      entry,
      result.ok ? 'llm call served by fallback model' : 'llm call returned invalid output',
    );
}

/**
 * The request itself failed (after the SDK's own retries on 408/409/429/5xx and
 * connection errors). Logs status, error class and request id for support.
 */
function logUpstreamFailure(
  label: string,
  attempt: number,
  requestedModel: string,
  err: unknown,
  durationMs: number,
): void {
  if (err instanceof Anthropic.APIUserAbortError) return;
  const api = err instanceof Anthropic.APIError ? err : undefined;
  getLogger().warn(
    {
      llm: label,
      attempt,
      requestedModel,
      errorType: err instanceof Error ? err.constructor.name : typeof err,
      status: api?.status,
      requestId: api?.requestID ?? undefined,
      message: err instanceof Error ? err.message.slice(0, 300) : undefined,
      durationMs,
    },
    'llm call failed upstream',
  );
}

type Validation<T> = { ok: true; value: T } | { ok: false; issues: string[]; fatal?: boolean };

function validate<S extends z.ZodTypeAny>(
  message: Anthropic.Beta.BetaMessage,
  call: StructuredCall<S>,
): Validation<z.output<S>> {
  if (message.stop_reason === 'refusal') {
    // Retrying the same request would be declined again.
    return { ok: false, fatal: true, issues: ['the model declined the request'] };
  }
  if (message.stop_reason === 'max_tokens') {
    return { ok: false, issues: ['output was cut off; keep text fields concise'] };
  }

  // After a server-side fallback, only the blocks after the last `fallback`
  // marker belong to the model that finished the answer.
  const lastFallback = message.content.findLastIndex((b) => (b.type as string) === 'fallback');
  const text = message.content
    .slice(lastFallback + 1)
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!text.trim()) return { ok: false, issues: ['no JSON output was returned'] };

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, issues: ['output was not valid JSON'] };
  }

  const parsed = call.schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map(
        (i: z.ZodIssue) => `${i.path.join('.') || '(root)'}: ${i.message}`,
      ),
    };
  }
  const extra = call.check?.(parsed.data) ?? [];
  if (extra.length) return { ok: false, issues: extra };
  return { ok: true, value: parsed.data };
}

function toUpstreamError(label: string, err: unknown): Error {
  if (err instanceof Anthropic.APIUserAbortError) return err;
  if (err instanceof Anthropic.APIError) {
    return new LlmUpstreamError(
      `${label}: Claude API error ${err.status ?? ''}`.trim(),
      err.status,
      {
        cause: err,
      },
    );
  }
  return new LlmUpstreamError(`${label}: Claude API request failed`, undefined, { cause: err });
}
