import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  JWT_SECRET: z.string().min(8, 'JWT_SECRET must be set (>= 8 chars)'),
  /** Comma-separated extra CORS origins; localhost / Expo dev origins are always allowed outside production. */
  CORS_ORIGINS: z.string().default(''),
  RATE_LIMIT_SCAN_PER_HOUR: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_DECODE_PER_HOUR: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_GLOBAL_PER_MINUTE: z.coerce.number().int().positive().default(300),
  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(8_000_000),
  /** Longest edge of the re-encoded image sent to the model. */
  MAX_IMAGE_EDGE: z.coerce.number().int().positive().default(2000),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid API configuration: ${issues}`);
  }
  return parsed.data;
}
