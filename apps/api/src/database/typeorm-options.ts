import './pg-type-parsers';
import { join } from 'node:path';
import { type DataSourceOptions } from 'typeorm';

/**
 * Single source of TypeORM settings for the Nest app and the migration CLI.
 * `synchronize` is always false: schema changes go through migrations only.
 */
export interface PoolSettings {
  /** Connections per API instance (serverless: keep small; Neon's pooler multiplexes them). */
  max: number;
}

export function buildDataSourceOptions(
  databaseUrl: string,
  pool: PoolSettings = { max: 10 },
): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    migrationsRun: false,
    migrationsTableName: 'typeorm_migrations',
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    extra: {
      max: pool.max,
      // Release idle connections quickly: serverless instances are frozen between requests.
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      // No startup `options` (e.g. TimeZone): PgBouncer-style poolers reject them. The database
      // default time zone is UTC (migration SetDatabaseTimeZoneUtc); no query depends on it.
    },
  };
}
