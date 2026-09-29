import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../errors.js';

export const TOKEN_TTL = '90d';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
    /** Verified user id from the bearer token, or null. Synchronous, no throw. */
    userIdFromToken: (req: FastifyRequest) => string | null;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function registerAuth(app: FastifyInstance, secret: string): Promise<void> {
  await app.register(fastifyJwt, {
    secret,
    sign: { algorithm: 'HS256', expiresIn: TOKEN_TTL },
    verify: { algorithms: ['HS256'] },
  });

  app.decorateRequest('userId', '');

  app.decorate('userIdFromToken', (req: FastifyRequest): string | null => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    try {
      const { sub } = app.jwt.verify<{ sub: string }>(header.slice(7));
      return typeof sub === 'string' && UUID_RE.test(sub) ? sub : null;
    } catch {
      return null;
    }
  });

  app.decorate('authenticate', async (req: FastifyRequest) => {
    const userId = app.userIdFromToken(req);
    if (!userId) throw new AppError(401, 'UNAUTHORIZED', 'Missing or invalid token');
    req.userId = userId;
  });
}
