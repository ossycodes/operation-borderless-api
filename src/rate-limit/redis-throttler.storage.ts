import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type Redis from 'ioredis';

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

const PREFIX = 'harmattan:throttle:';

/**
 * Fixed-window counter plus block flag, in one atomic round trip:
 * INCR the window, start its TTL on the first hit, and block the client for
 * `blockDuration` once the limit is exceeded.
 *
 * KEYS[1] = hit counter, KEYS[2] = block flag
 * ARGV[1] = window (ms), ARGV[2] = limit, ARGV[3] = block duration (ms)
 */
const INCREMENT = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
local blocked = redis.call('PTTL', KEYS[2])
if blocked < 0 and hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  blocked = tonumber(ARGV[3])
end
return { hits, ttl, blocked }
`;

/**
 * Redis-backed throttler storage. Redis earns its place again: with N API
 * replicas a client gets one limit across the cluster, not N limits.
 * If Redis is unavailable the limiter fails OPEN (logs and allows the
 * request): rate limiting protects the API, it must never take it down.
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitsKey = `${PREFIX}${throttlerName}:${key}`;
    try {
      const [totalHits, windowMs, blockMs] = (await this.redis.eval(
        INCREMENT,
        2,
        hitsKey,
        `${hitsKey}:blocked`,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number];

      return {
        totalHits,
        timeToExpire: Math.ceil(windowMs / 1000),
        isBlocked: blockMs > 0,
        timeToBlockExpire: Math.max(0, Math.ceil(blockMs / 1000)),
      };
    } catch (error) {
      this.logger.warn(
        `Rate limiter unavailable, allowing request: ${(error as Error).message}`,
      );
      return {
        totalHits: 0,
        timeToExpire: 0,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }
}
