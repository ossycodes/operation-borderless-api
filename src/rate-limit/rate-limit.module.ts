import { ExecutionContext, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import type Redis from 'ioredis';
import { AppConfigService } from '../config/app-config.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RedisThrottlerStorage } from './redis-throttler.storage';

const isRead = (context: ExecutionContext): boolean =>
  ['GET', 'HEAD', 'OPTIONS'].includes(
    context.switchToHttp().getRequest<Request>().method,
  );

/**
 * Per-client rate limits, enforced globally by ThrottlerGuard:
 * - `default`: every route (reads and writes);
 * - `writes`: a tighter budget for money-moving POSTs only.
 *
 * Clients are identified by IP (there is no authentication). Behind a load
 * balancer, set TRUST_PROXY_HOPS so the real client IP is used.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [AppConfigService, REDIS_CLIENT],
      useFactory: (config: AppConfigService, redis: Redis) => {
        const { windowSeconds, maxRequests, maxWrites } = config.rateLimit;
        return {
          throttlers: [
            {
              name: 'default',
              ttl: seconds(windowSeconds),
              limit: maxRequests,
            },
            {
              name: 'writes',
              ttl: seconds(windowSeconds),
              limit: maxWrites,
              skipIf: isRead,
            },
          ],
          storage: new RedisThrottlerStorage(redis),
          errorMessage: 'Too many requests; retry after the Retry-After delay',
        };
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
