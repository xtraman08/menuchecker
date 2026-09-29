import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';

declare module 'fastify' {
  interface FastifyInstance {
    /** Rate-limit key: the verified user id, else the client IP. */
    userRateKey: (req: FastifyRequest) => string;
    /** Route-level config for "max N requests per user per hour". */
    userRateLimit: (maxPerHour: number) => {
      max: number;
      timeWindow: string;
      keyGenerator: (req: FastifyRequest) => string;
    };
  }
}

/**
 * Global per-IP limit on every route, plus per-user hourly limits on the
 * expensive routes (scan, decode). In-memory store: fine for a single API
 * instance; swap for Redis if we ever run more than one.
 */
export async function registerRateLimit(app: FastifyInstance, globalPerMinute: number): Promise<void> {
  app.decorate('userRateKey', (req: FastifyRequest) => {
    const userId = app.userIdFromToken(req);
    return userId ? `user:${userId}` : `ip:${req.ip}`;
  });
  app.decorate('userRateLimit', (maxPerHour: number) => ({
    max: maxPerHour,
    timeWindow: '1 hour',
    keyGenerator: app.userRateKey,
  }));

  await app.register(fastifyRateLimit, {
    global: true,
    max: globalPerMinute,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) =>
      new AppError(429, 'RATE_LIMITED', `Too many requests, retry in ${ctx.after}`),
  });
}
