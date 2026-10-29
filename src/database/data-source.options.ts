import { DataSourceOptions } from 'typeorm';
import { MIGRATIONS } from './migrations';

/**
 * Shared by the Nest runtime, the TypeORM CLI and the test harness so all of
 * them agree on the connection and migration set. Entities are registered by
 * Nest (`autoLoadEntities`); the schema is owned by migrations only.
 */
export function buildDataSourceOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    migrations: MIGRATIONS,
    migrationsTableName: 'schema_migrations',
    synchronize: false,
    extra: { max: 20 },
  };
}
