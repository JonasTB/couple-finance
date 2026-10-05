import { z } from 'zod';

const PLACEHOLDER_SECRET_MARKER = 'change-me';

/**
 * Environment contract for the API. Validated once at startup; the process refuses to boot
 * with an invalid configuration.
 */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    CORS_ORIGINS: z
      .string()
      .default('http://localhost:5173')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .pipe(z.array(z.url())),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_URL: z.url().refine((value) => /^postgres(ql)?:\/\//.test(value), {
      message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
    }),
    /** Connections per API instance; keep small on serverless (Neon's pooler multiplexes). */
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    /**
     * Express `trust proxy`: "false" (direct), "true" (behind a proxy that overwrites
     * X-Forwarded-For, such as Vercel), or the number of proxy hops.
     */
    TRUST_PROXY: z
      .string()
      .default('false')
      .transform((value, ctx): boolean | number => {
        if (value === 'true') return true;
        if (value === 'false') return false;
        const hops = Number(value);
        if (Number.isInteger(hops) && hops >= 0) return hops;
        ctx.addIssue({ code: 'custom', message: 'TRUST_PROXY must be true, false or a hop count' });
        return z.NEVER;
      }),
    /**
     * Shared rate-limit counters (Upstash Redis REST API). Optional: without them counters stay
     * in memory per instance. The Vercel Marketplace integration injects KV_REST_API_URL/TOKEN.
     */
    RATE_LIMIT_REDIS_REST_URL: z.url().optional(),
    RATE_LIMIT_REDIS_REST_TOKEN: z.string().min(1).optional(),
    // --- Auth (ADR-004) ---
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must have at least 32 characters'),
    JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    /** Requests per minute per client IP across /auth endpoints. */
    AUTH_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(20),
    /** Login attempts per normalized email per 15 minutes. */
    LOGIN_RATE_LIMIT_PER_EMAIL: z.coerce.number().int().min(1).default(10),
    /** Requests per minute per signed-in user (or client IP) on every other endpoint. */
    API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  })
  .superRefine((env, ctx) => {
    if (Boolean(env.RATE_LIMIT_REDIS_REST_URL) !== Boolean(env.RATE_LIMIT_REDIS_REST_TOKEN)) {
      ctx.addIssue({
        code: 'custom',
        path: ['RATE_LIMIT_REDIS_REST_TOKEN'],
        message: 'Set both RATE_LIMIT_REDIS_REST_URL and RATE_LIMIT_REDIS_REST_TOKEN, or neither',
      });
    }
    if (
      env.NODE_ENV === 'production' &&
      env.JWT_ACCESS_SECRET.includes(PLACEHOLDER_SECRET_MARKER)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET still holds the placeholder value',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  // Upstash via the Vercel Marketplace names its variables KV_REST_API_*.
  const result = envSchema.safeParse({
    ...raw,
    // On Vercel (system variable VERCEL=1) the app runs as production unless told otherwise.
    // NODE_ENV must not be set in the Vercel dashboard: it would make the build skip devDependencies.
    NODE_ENV: raw.NODE_ENV ?? (raw.VERCEL === '1' ? 'production' : undefined),
    RATE_LIMIT_REDIS_REST_URL: raw.RATE_LIMIT_REDIS_REST_URL ?? raw.KV_REST_API_URL,
    RATE_LIMIT_REDIS_REST_TOKEN: raw.RATE_LIMIT_REDIS_REST_TOKEN ?? raw.KV_REST_API_TOKEN,
  });
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
