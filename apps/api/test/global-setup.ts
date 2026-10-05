import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../src/database/typeorm-options';
import { applyTestEnv } from './test-env';

/** Brings the test database schema up to date and empties it before the e2e suite. */
export default async function globalSetup(): Promise<void> {
  applyTestEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL_TEST is not configured');
  }
  const dataSource = new DataSource(buildDataSourceOptions(databaseUrl));
  await dataSource.initialize();
  try {
    await dataSource.runMigrations({ transaction: 'each' });
    const tables: { tablename: string }[] = await dataSource.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'typeorm_migrations'`,
    );
    if (tables.length > 0) {
      const list = tables.map(({ tablename }) => `"${tablename}"`).join(', ');
      await dataSource.query(`TRUNCATE ${list} CASCADE`);
    }
  } finally {
    await dataSource.destroy();
  }
}
