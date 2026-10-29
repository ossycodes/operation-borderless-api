import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/database/data-source.options';

/**
 * Boots throwaway Postgres + Redis containers for the e2e suite (or reuses
 * TEST_DATABASE_URL / TEST_REDIS_URL when provided, e.g. in CI services),
 * then runs migrations exactly once before any test worker starts.
 */
export default async function globalSetup(): Promise<void> {
  let databaseUrl = process.env.TEST_DATABASE_URL;
  let redisUrl = process.env.TEST_REDIS_URL;

  if (!databaseUrl) {
    const postgres = await new PostgreSqlContainer('postgres:18-alpine')
      .withDatabase('harmattan_test')
      .start();
    databaseUrl = postgres.getConnectionUri();
    globalThis.__POSTGRES_CONTAINER__ = postgres;
  }
  if (!redisUrl) {
    const redis = await new RedisContainer('redis:8-alpine').start();
    redisUrl = redis.getConnectionUrl();
    globalThis.__REDIS_CONTAINER__ = redis;
  }

  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    // Migrations run once here, not concurrently from every test worker.
    DB_RUN_MIGRATIONS: 'false',
    // Deterministic rates; no network in tests.
    FX_PROVIDER: 'static',
    FX_REFRESH_JOB_ENABLED: 'false',
  });

  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();
  await dataSource.runMigrations();
  await dataSource.destroy();
}
