import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { ResolvedRates } from './fx.types';

const KEY = 'fx:usd-rates:v1';

/**
 * Shared, cluster-wide cache of the resolved rate table. Redis earns its
 * place here: every API instance quotes from the same table (consistent
 * rates across replicas) and the provider is hit once per TTL, not once per
 * instance. Cache failures degrade to a miss — never to an error.
 */
@Injectable()
export class FxRateCache {
  private readonly logger = new Logger(FxRateCache.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get(): Promise<ResolvedRates | null> {
    try {
      const raw = await this.redis.get(KEY);
      return raw ? (JSON.parse(raw) as ResolvedRates) : null;
    } catch (error) {
      this.logger.warn(`FX cache read failed: ${(error as Error).message}`);
      return null;
    }
  }

  async set(value: ResolvedRates, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(KEY, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logger.warn(`FX cache write failed: ${(error as Error).message}`);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.redis.del(KEY);
    } catch {
      // best effort
    }
  }
}
