// Typed errors thrown by the LLM module. Callers (routes) map these to HTTP
// status codes via `code`; nothing here ever carries unvalidated model output.
import type { ErrorCode } from '@fare/shared';

export class LlmError extends Error {
  readonly code: ErrorCode = 'UPSTREAM_ERROR';
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Server is missing ANTHROPIC_API_KEY. */
export class LlmConfigError extends LlmError {}

/** The caller passed something we won't send to the model (bad mime, empty image, no dishes). */
export class LlmInputError extends LlmError {
  override readonly code: ErrorCode = 'BAD_REQUEST';
}

/**
 * The model's output failed schema validation twice (initial attempt + one retry),
 * was truncated, or the model declined the request. `issues` is a short,
 * human-readable list for logs; it never includes raw model text.
 */
export class LlmOutputError extends LlmError {
  readonly issues: string[];
  constructor(message: string, issues: string[] = [], options?: { cause?: unknown }) {
    super(message, options);
    this.issues = issues;
  }
}

/** The Claude API failed after the SDK's own retries (network, 429, 5xx, auth). */
export class LlmUpstreamError extends LlmError {
  readonly status: number | undefined;
  constructor(message: string, status?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.status = status;
  }
}
