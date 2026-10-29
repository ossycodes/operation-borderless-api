import { Injectable, type LogLevel } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables, NodeEnv } from './env.validation';

/**
 * Typed facade over ConfigService so feature code never deals with raw
 * string keys or `undefined` checks.
 */
@Injectable()
export class AppConfigService {
  constructor(
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  private get<K extends keyof EnvironmentVariables>(
    key: K,
  ): EnvironmentVariables[K] {
    return this.config.get(key, { infer: true });
  }

  get nodeEnv(): NodeEnv {
    return this.get('NODE_ENV');
  }

  get port(): number {
    return this.get('PORT');
  }

  get databaseUrl(): string {
    return this.get('DATABASE_URL');
  }

  get redisUrl(): string {
    return this.get('REDIS_URL');
  }

  get logLevel(): LogLevel {
    return this.get('LOG_LEVEL');
  }

  get runMigrations(): boolean {
    return this.get('DB_RUN_MIGRATIONS');
  }

  get fx() {
    return {
      provider: this.get('FX_PROVIDER'),
      apiUrl: this.get('FX_API_URL'),
      httpTimeoutMs: this.get('FX_HTTP_TIMEOUT_MS'),
      cacheTtlSeconds: this.get('FX_CACHE_TTL_SECONDS'),
      refreshIntervalSeconds: this.get('FX_REFRESH_INTERVAL_SECONDS'),
      refreshJobEnabled: this.get('FX_REFRESH_JOB_ENABLED'),
    };
  }
}
