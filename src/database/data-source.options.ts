import { join } from 'node:path';
import { DataSourceOptions } from 'typeorm';

/**
 * Shared by the Nest runtime and the TypeORM CLI so both always agree on
 * where entities and migrations live.
 */
export function buildDataSourceOptions(url: string): DataSourceOptions {
  return {
    type: 'postgres',
    url,
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'schema_migrations',
    // Schema is owned by hand-written migrations, never by entity sync.
    synchronize: false,
    extra: { max: 20 },
  };
}
