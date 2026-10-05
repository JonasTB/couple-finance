import { validateEnv } from './env';

const SECRET = 'a-very-long-local-test-secret-0123456789';
const valid = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db', JWT_ACCESS_SECRET: SECRET };

describe('validateEnv', () => {
  it('applies defaults for optional variables', () => {
    const env = validateEnv(valid);
    expect(env).toMatchObject({
      NODE_ENV: 'development',
      API_PORT: 3000,
      CORS_ORIGINS: ['http://localhost:5173'],
      LOG_LEVEL: 'info',
      JWT_ACCESS_TTL_SECONDS: 900,
      REFRESH_TOKEN_TTL_DAYS: 30,
    });
  });

  it('parses a comma-separated CORS origin list', () => {
    const env = validateEnv({ ...valid, CORS_ORIGINS: 'http://a.test, https://b.test' });
    expect(env.CORS_ORIGINS).toEqual(['http://a.test', 'https://b.test']);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects a non-postgres DATABASE_URL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/postgres/);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow(/at least 32/);
  });

  it('rejects the placeholder JWT secret in production only', () => {
    const placeholder = {
      ...valid,
      JWT_ACCESS_SECRET: 'change-me-local-only-at-least-32-characters',
    };
    expect(() => validateEnv({ ...placeholder, NODE_ENV: 'production' })).toThrow(/placeholder/);
    expect(() => validateEnv({ ...placeholder, NODE_ENV: 'development' })).not.toThrow();
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnv({ ...valid, API_PORT: '70000' })).toThrow(/API_PORT/);
  });

  it('reads deployment settings: pool size, trust proxy and the shared rate-limit store', () => {
    expect(validateEnv(valid)).toMatchObject({ DATABASE_POOL_MAX: 10, TRUST_PROXY: false });
    expect(validateEnv({ ...valid, TRUST_PROXY: 'true', DATABASE_POOL_MAX: '3' })).toMatchObject({
      TRUST_PROXY: true,
      DATABASE_POOL_MAX: 3,
    });
    expect(validateEnv({ ...valid, TRUST_PROXY: '2' }).TRUST_PROXY).toBe(2);
    expect(() => validateEnv({ ...valid, TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);

    // Upstash through the Vercel Marketplace provides KV_REST_API_*.
    expect(
      validateEnv({
        ...valid,
        KV_REST_API_URL: 'https://redis.example.com',
        KV_REST_API_TOKEN: 't',
      }),
    ).toMatchObject({
      RATE_LIMIT_REDIS_REST_URL: 'https://redis.example.com',
      RATE_LIMIT_REDIS_REST_TOKEN: 't',
    });
    expect(() =>
      validateEnv({ ...valid, RATE_LIMIT_REDIS_REST_URL: 'https://redis.example.com' }),
    ).toThrow(/RATE_LIMIT_REDIS_REST_TOKEN/);
  });

  it('runs as production on Vercel unless NODE_ENV says otherwise', () => {
    expect(validateEnv({ ...valid, VERCEL: '1' }).NODE_ENV).toBe('production');
    expect(validateEnv({ ...valid, VERCEL: '1', NODE_ENV: 'development' }).NODE_ENV).toBe(
      'development',
    );
    // The production guard still applies there.
    expect(() =>
      validateEnv({
        ...valid,
        VERCEL: '1',
        JWT_ACCESS_SECRET: 'change-me-local-only-at-least-32-characters',
      }),
    ).toThrow(/placeholder/);
  });
});
