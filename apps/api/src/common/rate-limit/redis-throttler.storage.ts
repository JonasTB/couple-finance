import { Logger } from '@nestjs/common';
import { type ThrottlerStorage } from '@nestjs/throttler';

/** The record type is not exported by @nestjs/throttler; derive it from the public interface. */
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

const REQUEST_TIMEOUT_MS = 1_500;

/**
 * Rate-limit counters shared by every API instance, in Redis via the Upstash REST API (no TCP
 * connection to keep warm, which suits serverless functions). Fixed window per key: INCR, set the
 * expiry on the first hit, read the remaining time.
 *
 * Fails open: if Redis is unreachable the request is allowed and a warning is logged, so an
 * outage of the limiter never takes the API down with it.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    _blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `cf:rl:${throttlerName}:${key}`;
    try {
      const response = await this.fetchImpl(`${this.url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
        body: JSON.stringify([
          ['INCR', redisKey],
          ['PEXPIRE', redisKey, String(ttl), 'NX'],
          ['PTTL', redisKey],
        ]),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`Redis REST responded ${String(response.status)}`);
      }
      const [hits, , pttl] = (await response.json()) as { result?: unknown }[];
      const totalHits = Number(hits?.result);
      const remainingMs = Number(pttl?.result);
      if (!Number.isFinite(totalHits)) {
        throw new Error('Unexpected Redis REST response');
      }
      const timeToExpire = Math.max(1, Math.ceil((remainingMs > 0 ? remainingMs : ttl) / 1000));
      const isBlocked = totalHits > limit;
      return {
        totalHits,
        timeToExpire,
        isBlocked,
        timeToBlockExpire: isBlocked ? timeToExpire : 0,
      };
    } catch (error) {
      this.logger.warn(
        `Rate-limit store unavailable, allowing the request: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
      return {
        totalHits: 0,
        timeToExpire: Math.ceil(ttl / 1000),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
