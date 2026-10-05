import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { type Env } from '../../config/env';
import { RedisThrottlerStorage } from './redis-throttler.storage';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;

/** Login attempts are also limited per account, regardless of the client IP. */
function emailTracker(request: Record<string, unknown>): string {
  const body = request.body;
  const email =
    typeof body === 'object' && body !== null && 'email' in body && typeof body.email === 'string'
      ? body.email.trim().toLowerCase()
      : '';
  return email.length > 0 ? `email:${email}` : `ip:${String(request.ip)}`;
}

/** Signed-in requests count per user (shared NAT stays usable); anonymous ones per IP. */
function userTracker(request: Record<string, unknown>): string {
  const user = request.user;
  return typeof user === 'object' &&
    user !== null &&
    'userId' in user &&
    typeof user.userId === 'string'
    ? `user:${user.userId}`
    : `ip:${String(request.ip)}`;
}

/**
 * Throttlers (ADR-004, SECURITY_PRIVACY.md §3).
 * - `ip`: AUTH_RATE_LIMIT_PER_MINUTE per client IP (auth and invitation endpoints, applied per
 *   controller with `@UseGuards(ThrottlerGuard)`)
 * - `email`: LOGIN_RATE_LIMIT_PER_EMAIL per normalized email per 15 minutes (login only)
 * - `api`: API_RATE_LIMIT_PER_MINUTE per user (or IP) on every other endpoint, enforced by the
 *   global `ApiRateLimitGuard`; auth and invitation controllers skip it (they have `ip`).
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const redisUrl = config.get('RATE_LIMIT_REDIS_REST_URL', { infer: true });
        const redisToken = config.get('RATE_LIMIT_REDIS_REST_TOKEN', { infer: true });
        return {
          // Shared counters across instances when Redis is configured; in memory otherwise.
          ...(redisUrl && redisToken
            ? { storage: new RedisThrottlerStorage(redisUrl, redisToken) }
            : {}),
          errorMessage: 'Too many requests. Try again later.',
          throttlers: [
            {
              name: 'ip',
              ttl: 60_000,
              limit: config.get('AUTH_RATE_LIMIT_PER_MINUTE', { infer: true }),
            },
            {
              name: 'email',
              ttl: LOGIN_WINDOW_MS,
              limit: config.get('LOGIN_RATE_LIMIT_PER_EMAIL', { infer: true }),
              getTracker: emailTracker,
            },
            {
              name: 'api',
              ttl: 60_000,
              limit: config.get('API_RATE_LIMIT_PER_MINUTE', { infer: true }),
              getTracker: userTracker,
            },
          ],
        };
      },
    }),
  ],
  exports: [ThrottlerModule],
})
export class RateLimitModule {}
