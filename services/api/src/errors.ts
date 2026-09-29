import type { FastifyError, FastifyInstance } from 'fastify';
import type { ApiError, ErrorCode } from '@fare/shared';
import { ZodError } from 'zod';
import { LlmConfigError, LlmError, LlmInputError } from './llm/index.js';

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, 'NOT_FOUND', `${what} not found`);

export function errorBody(code: ErrorCode, message: string): ApiError {
  return { error: { code, message } };
}

function zodMessage(err: ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}

const STATUS_CODES: Record<number, ErrorCode> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  406: 'UNSUPPORTED_MEDIA_TYPE',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

/** Every error leaves the API as `{ error: { code, message } }`; internals are never leaked. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((err: FastifyError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message));
    }
    if (err instanceof ZodError) {
      return reply.status(400).send(errorBody('VALIDATION_ERROR', zodMessage(err)));
    }
    // LLM module failures surface without internals (never raw model output).
    if (err instanceof LlmInputError) {
      return reply.status(400).send(errorBody('BAD_REQUEST', err.message));
    }
    if (err instanceof LlmError) {
      req.log.error({ err }, 'llm failure');
      const status = err instanceof LlmConfigError ? 503 : 502;
      return reply.status(status).send(errorBody('UPSTREAM_ERROR', 'The menu reader is unavailable, please retry'));
    }
    const status = (err as FastifyError).statusCode;
    if (status && status >= 400 && status < 500) {
      const code: ErrorCode = (err as FastifyError).code === 'FST_REQ_FILE_TOO_LARGE'
        ? 'PAYLOAD_TOO_LARGE'
        : (STATUS_CODES[status] ?? 'BAD_REQUEST');
      return reply.status(status).send(errorBody(code, err.message));
    }
    req.log.error({ err }, 'unhandled error');
    return reply.status(500).send(errorBody('INTERNAL', 'Something went wrong'));
  });

  app.setNotFoundHandler((req, reply) => {
    reply.status(404).send(errorBody('NOT_FOUND', `Route ${req.method} ${req.url} not found`));
  });
}
