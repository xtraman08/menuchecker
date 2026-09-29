import type { FastifyInstance } from 'fastify';
import type { AuthResponse, HealthResponse } from '@fare/shared';
import type { Deps } from '../ports.js';

export async function authRoutes(app: FastifyInstance, { deps }: { deps: Deps }): Promise<void> {
  app.get('/health', { config: { rateLimit: false } }, async (): Promise<HealthResponse> => ({
    ok: true,
  }));

  // Anonymous sign-up: a user row with no PII, and a signed token for it.
  app.post(
    '/auth/anonymous',
    { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (_req, reply): Promise<AuthResponse> => {
      const userId = await deps.db.createAnonymousUser();
      const token = await reply.jwtSign({ sub: userId });
      reply.status(201);
      return { token, userId };
    },
  );
}
