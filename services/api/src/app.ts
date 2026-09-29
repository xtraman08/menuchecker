import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { registerErrorHandling } from './errors.js';
import { registerAuth } from './plugins/auth.js';
import { registerRateLimit } from './plugins/rateLimit.js';
import type { Deps } from './ports.js';
import { authRoutes } from './routes/auth.js';
import { dishRoutes } from './routes/dishes.js';
import { meRoutes } from './routes/me.js';
import { restaurantRoutes } from './routes/restaurants.js';
import { scanRoutes } from './routes/scans.js';

const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export function corsOrigins(config: Config): (string | RegExp)[] {
  const listed = config.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  return config.NODE_ENV === 'production' ? listed : [...listed, DEV_ORIGIN];
}

export async function buildApp(config: Config, deps: Deps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.LOG_LEVEL, redact: ['req.headers.authorization'] },
    trustProxy: true,
  });

  registerErrorHandling(app);
  await app.register(cors, {
    origin: corsOrigins(config),
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });
  await registerAuth(app, config.JWT_SECRET);
  await registerRateLimit(app, config.RATE_LIMIT_GLOBAL_PER_MINUTE);
  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: 1, fields: 5, parts: 6, fieldSize: 1024 },
  });

  await app.register(authRoutes, { deps });
  await app.register(scanRoutes, { deps, config });
  await app.register(restaurantRoutes, { deps, config });
  await app.register(dishRoutes, { deps });
  await app.register(meRoutes, { deps });

  return app;
}
